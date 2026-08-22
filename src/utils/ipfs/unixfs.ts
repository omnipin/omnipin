/**
 * Vendored subset of `ipfs-unixfs-importer@17.0.1` (Apache-2.0 OR MIT).
 *
 * Upstream is a general-purpose importer with pluggable chunkers, layouts and
 * DAG builders. `packCAR` only ever calls it one way, so this copy keeps that
 * single configuration and drops the rest — which removes `rabin-wasm`
 * (-> `bl` -> `buffer`) and `blockstore-core` (-> the libp2p logger stack)
 * from the dependency tree.
 *
 * The pinned configuration, matching upstream's defaults:
 *
 *   cidVersion               1
 *   rawLeaves                true         (leaf blocks are raw, not UnixFS)
 *   reduceSingleLeafToSelf   true
 *   leafType                 n/a          (dead under rawLeaves)
 *   chunker                  fixed-size, 262144 bytes
 *   layout                   balanced, 174 children per node
 *   wrapWithDirectory        true
 *   shardSplitStrategy       'links-bytes'
 *   shardSplitThresholdBytes 262144
 *   shardFanoutBits          8
 *   fileImportConcurrency    50
 *   blockWriteConcurrency    10
 *
 * Block-for-block identical output to upstream under this configuration; the
 * `unixfs importer parity` suite pins the root CIDs that prove it. If you
 * change anything here, that suite is the thing that has to keep passing.
 */

import type { PBLink, PBNode } from '@ipld/dag-pb'
import * as dagPb from '@ipld/dag-pb'
import { encode, prepare } from '@ipld/dag-pb'
import { murmur3128 } from '@multiformats/murmur3'
import { Bucket, type BucketChild, createHAMT } from 'hamt-sharding'
import type { Blockstore } from 'interface-blockstore'
import type { Mtime } from 'ipfs-unixfs'
import { UnixFS } from 'ipfs-unixfs'
import type { Version as CIDVersion } from 'multiformats/cid'
import { CID } from 'multiformats/cid'
import type { BlockCodec } from 'multiformats/codecs/interface'
import * as rawCodec from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

const CID_VERSION: CIDVersion = 1
const CHUNK_SIZE = 262_144
const MAX_CHILDREN_PER_NODE = 174
const SHARD_SPLIT_THRESHOLD_BYTES = 262_144
const SHARD_FANOUT_BITS = 8
const SHARD_HASH_CODE = BigInt(0x22)
const FILE_IMPORT_CONCURRENCY = 50
const BLOCK_WRITE_CONCURRENCY = 10

export type ByteStream = Iterable<Uint8Array> | AsyncIterable<Uint8Array>
export type ImportContent = ByteStream | Uint8Array
export type WritableStorage = Pick<Blockstore, 'put'>

export interface FileCandidate<T extends ImportContent = ImportContent> {
  path?: string
  content: T
  mtime?: Mtime
  mode?: number
}

export interface DirectoryCandidate {
  path: string
  mtime?: Mtime
  mode?: number
}

export type ImportCandidate = FileCandidate | DirectoryCandidate

interface File {
  content: AsyncIterable<Uint8Array>
  path?: string
  mtime?: Mtime
  mode?: number
  originalPath?: string
}

export interface ImportResult {
  cid: CID
  size: bigint
  path?: string
  unixfs?: UnixFS
}

interface InProgressImportResult extends ImportResult {
  originalPath?: string
  /** Set only while a single-block file is still a candidate for inlining. */
  single?: true
  block?: Uint8Array
}

export class InvalidContentError extends Error {
  name = 'InvalidContentError'
  code = 'ERR_INVALID_CONTENT'

  constructor(message = 'Invalid content') {
    super(message)
  }
}

// --- async iteration helpers (inlined from it-batch / it-parallel-batch) ---

/**
 * Collect `source` into arrays of at most `size`. Accepts sync or async
 * sources — the balanced layout recurses with a plain array.
 */
async function* batch<T>(
  source: AsyncIterable<T> | Iterable<T>,
  size: number,
): AsyncGenerator<T[]> {
  let things: T[] = []

  for await (const thing of source) {
    things.push(thing)

    while (things.length >= size) {
      yield things.slice(0, size)
      things = things.slice(size)
    }
  }

  while (things.length > 0) {
    yield things.slice(0, size)
    things = things.slice(size)
  }
}

/**
 * Invoke promise-returning thunks `size` at a time, yielding results in input
 * order. Every task in a batch is started before any is awaited, so a slow
 * task does not stall its siblings.
 */
async function* parallelBatch<T>(
  source: AsyncIterable<() => Promise<T>> | Iterable<() => Promise<T>>,
  size: number,
): AsyncGenerator<T> {
  for await (const tasks of batch(source, size)) {
    const things = tasks.map(async (p) =>
      p().then(
        (value) => ({ ok: true as const, value }),
        (err) => ({ ok: false as const, err }),
      ),
    )

    for (let i = 0; i < things.length; i++) {
      const result = await things[i]

      if (result.ok) {
        yield result.value
      } else {
        throw result.err
      }
    }
  }
}

// --- block persistence ---

interface PersistOptions {
  codec?: BlockCodec<number, unknown>
  cidVersion?: CIDVersion
  signal?: AbortSignal
}

const persist = async (
  buffer: Uint8Array,
  blockstore: WritableStorage,
  options: PersistOptions = {},
): Promise<CID> => {
  const codec = options.codec ?? dagPb
  const multihash = await sha256.digest(buffer)
  const cid = CID.create(
    options.cidVersion ?? CID_VERSION,
    codec.code,
    multihash,
  )

  await blockstore.put(cid, buffer, options)

  return cid
}

// --- chunking ---

/**
 * Fixed-size chunker. Emits exactly `CHUNK_SIZE` bytes per chunk apart from a
 * possibly-short final chunk, and emits exactly one empty chunk for empty
 * input — both of which the CID depends on.
 */
async function* fixedSizeChunker(
  source: AsyncIterable<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  // Queue of pending buffers. `offset` is how far into queue[0] we have
  // already emitted, so the common single-buffer case needs no copying.
  let queue: Uint8Array[] = []
  let offset = 0
  let currentLength = 0
  let emitted = false

  for await (const buffer of source) {
    if (buffer.byteLength > 0) {
      queue.push(buffer)
      currentLength += buffer.byteLength
    }

    while (currentLength >= CHUNK_SIZE) {
      const head = queue[0]

      // Fast path: the whole chunk is already contiguous in the head buffer.
      if (head.byteLength - offset >= CHUNK_SIZE) {
        yield head.subarray(offset, offset + CHUNK_SIZE)
        offset += CHUNK_SIZE

        if (offset === head.byteLength) {
          queue.shift()
          offset = 0
        }
      } else {
        const chunk = new Uint8Array(CHUNK_SIZE)
        let filled = 0

        while (filled < CHUNK_SIZE) {
          const from = queue[0]
          const take = Math.min(CHUNK_SIZE - filled, from.byteLength - offset)

          chunk.set(from.subarray(offset, offset + take), filled)
          filled += take
          offset += take

          if (offset === from.byteLength) {
            queue.shift()
            offset = 0
          }
        }

        yield chunk
      }

      emitted = true
      currentLength -= CHUNK_SIZE
    }
  }

  if (!emitted || currentLength > 0) {
    if (currentLength === 0) {
      yield new Uint8Array(0)
    } else if (queue.length === 1) {
      yield queue[0].subarray(offset, offset + currentLength)
    } else {
      const chunk = new Uint8Array(currentLength)
      let filled = 0

      while (filled < currentLength) {
        const src = queue[0]
        const take = Math.min(currentLength - filled, src.byteLength - offset)

        chunk.set(src.subarray(offset, offset + take), filled)
        filled += take
        offset += take

        if (offset === src.byteLength) {
          queue.shift()
          offset = 0
        }
      }

      yield chunk
    }

    queue = []
  }
}

// --- content normalisation ---

function isIterable(thing: unknown): thing is Iterable<Uint8Array> {
  return Symbol.iterator in (thing as object)
}

function isAsyncIterable(thing: unknown): thing is AsyncIterable<Uint8Array> {
  return Symbol.asyncIterator in (thing as object)
}

function contentAsAsyncIterable(
  content: ImportContent,
): AsyncIterable<Uint8Array> {
  try {
    if (content instanceof Uint8Array) {
      return (async function* () {
        yield content
      })()
    }

    if (isIterable(content)) {
      return (async function* () {
        yield* content
      })()
    }

    if (isAsyncIterable(content)) {
      return content
    }
  } catch {
    throw new InvalidContentError('Content was invalid')
  }

  throw new InvalidContentError('Content was invalid')
}

const textEncoder = new TextEncoder()

/**
 * Coerce whatever the source yielded into `Uint8Array`. A `ReadStream` opened
 * with an encoding yields strings, which would otherwise hash as garbage.
 */
async function* validateChunks(
  source: AsyncIterable<unknown>,
): AsyncGenerator<Uint8Array> {
  for await (const content of source) {
    if ((content as Uint8Array)?.length === undefined) {
      throw new InvalidContentError('Content was invalid')
    }

    if (typeof content === 'string' || content instanceof String) {
      yield textEncoder.encode(content.toString())
    } else if (Array.isArray(content)) {
      yield Uint8Array.from(content)
    } else if (content instanceof Uint8Array) {
      yield content
    } else {
      throw new InvalidContentError('Content was invalid')
    }
  }
}

// --- leaf blocks ---

/**
 * Write each chunk as a raw block. Under `rawLeaves` the leaf carries no
 * UnixFS wrapper, so leaves are always CIDv1 + raw codec regardless of the
 * CID version used for the enclosing DAG.
 */
async function* bufferImporter(
  file: File,
  blockstore: WritableStorage,
): AsyncGenerator<() => Promise<InProgressImportResult>> {
  for await (const block of file.content) {
    yield async () => {
      const cid = await persist(block, blockstore, {
        codec: rawCodec,
        cidVersion: 1,
      })

      return { cid, size: BigInt(block.length), block }
    }
  }
}

/**
 * Yield leaves, tagging a lone leaf as `single` so `reduce` can inline it.
 * The `block` payload is dropped once we know there is more than one leaf —
 * it is only needed for the inlining path and would otherwise pin every
 * chunk of a large file in memory.
 */
async function* buildFileBatch(
  file: File,
  blockstore: WritableStorage,
): AsyncGenerator<InProgressImportResult> {
  let count = -1
  let previous: InProgressImportResult | undefined

  for await (const entry of parallelBatch(
    bufferImporter(file, blockstore),
    BLOCK_WRITE_CONCURRENCY,
  )) {
    count++

    if (count === 0) {
      previous = { ...entry, single: true }
      continue
    }

    if (count === 1 && previous != null) {
      yield { ...previous, block: undefined, single: undefined }
      previous = undefined
    }

    yield { ...entry, block: undefined }
  }

  if (previous != null) {
    yield previous
  }
}

// --- file DAG assembly ---

type Reducer = (
  leaves: InProgressImportResult[],
) => Promise<InProgressImportResult>

function isSingleBlockImport(result: InProgressImportResult): boolean {
  return result.single === true
}

const reduce = (file: File, blockstore: WritableStorage): Reducer => {
  return async function reducer(leaves) {
    if (leaves.length === 1 && isSingleBlockImport(leaves[0])) {
      const leaf = leaves[0]

      if (file.mtime !== undefined || file.mode !== undefined) {
        // A raw leaf has nowhere to hang metadata, so re-encode the lone
        // block as a UnixFS file node carrying the bytes inline.
        leaf.unixfs = new UnixFS({
          type: 'file',
          mtime: file.mtime,
          mode: file.mode,
          data: leaf.block,
        })

        leaf.block = encode(prepare({ Data: leaf.unixfs.marshal(), Links: [] }))
        leaf.cid = await persist(leaf.block, blockstore, {
          cidVersion: CID_VERSION,
        })
        leaf.size = BigInt(leaf.block.length)
      }

      return {
        cid: leaf.cid,
        path: file.path,
        unixfs: leaf.unixfs,
        size: leaf.size,
        originalPath: file.originalPath,
      }
    }

    const f = new UnixFS({ type: 'file', mtime: file.mtime, mode: file.mode })

    const links: PBLink[] = leaves
      .filter((leaf) => {
        if (leaf.cid.code === rawCodec.code && leaf.size > 0) {
          return true
        }

        if (
          leaf.unixfs != null &&
          leaf.unixfs.data == null &&
          leaf.unixfs.fileSize() > 0n
        ) {
          return true
        }

        return Boolean(leaf.unixfs?.data?.length)
      })
      .map((leaf) => {
        if (leaf.cid.code === rawCodec.code) {
          // raw leaf: the block is the file data
          f.addBlockSize(leaf.size)
        } else if (leaf.unixfs?.data == null) {
          // intermediate node: sum of its own subtree
          f.addBlockSize(leaf.unixfs?.fileSize() ?? 0n)
        } else {
          // UnixFS 'file' leaf carrying inline data
          f.addBlockSize(BigInt(leaf.unixfs.data.length))
        }

        return { Name: '', Tsize: Number(leaf.size), Hash: leaf.cid }
      })

    const node = { Data: f.marshal(), Links: links }
    const block = encode(prepare(node))
    const cid = await persist(block, blockstore, { cidVersion: CID_VERSION })

    return {
      cid,
      path: file.path,
      unixfs: f,
      size: BigInt(
        block.length +
          node.Links.reduce((acc, curr) => acc + (curr.Tsize ?? 0), 0),
      ),
      originalPath: file.originalPath,
      block,
    }
  }
}

/**
 * Balanced layout: fold leaves into parents `MAX_CHILDREN_PER_NODE` at a time,
 * then fold the parents, until a single root remains.
 */
async function balancedLayout(
  source:
    | AsyncIterable<InProgressImportResult>
    | Iterable<InProgressImportResult>,
  reducer: Reducer,
): Promise<InProgressImportResult> {
  const roots: InProgressImportResult[] = []

  for await (const chunked of batch(source, MAX_CHILDREN_PER_NODE)) {
    roots.push(await reducer(chunked))
  }

  if (roots.length > 1) {
    return balancedLayout(roots, reducer)
  }

  return roots[0]
}

const buildFile = async (
  file: File,
  blockstore: WritableStorage,
): Promise<InProgressImportResult> =>
  balancedLayout(buildFileBatch(file, blockstore), reduce(file, blockstore))

// --- directory nodes ---

const buildDir = async (
  dir: { path?: string; mtime?: Mtime; mode?: number; originalPath?: string },
  blockstore: WritableStorage,
): Promise<InProgressImportResult> => {
  const unixfs = new UnixFS({
    type: 'directory',
    mtime: dir.mtime,
    mode: dir.mode,
  })
  const block = encode(prepare({ Data: unixfs.marshal() }))
  const cid = await persist(block, blockstore, { cidVersion: CID_VERSION })

  return {
    cid,
    path: dir.path,
    unixfs,
    size: BigInt(block.length),
    originalPath: dir.originalPath,
    block,
  }
}

// --- candidate stream -> DAG stream ---

function isFileCandidate(entry: ImportCandidate): entry is FileCandidate {
  return (entry as FileCandidate).content != null
}

async function* dagBuilder(
  source: AsyncIterable<ImportCandidate> | Iterable<ImportCandidate>,
  blockstore: WritableStorage,
): AsyncGenerator<() => Promise<InProgressImportResult>> {
  for await (const entry of source) {
    let originalPath: string | undefined

    if (entry.path != null) {
      originalPath = entry.path
      entry.path = entry.path
        .split('/')
        .filter((path) => path != null && path !== '.')
        .join('/')
    }

    if (isFileCandidate(entry)) {
      const file: File = {
        path: entry.path,
        mtime: entry.mtime,
        mode: entry.mode,
        content: fixedSizeChunker(
          validateChunks(contentAsAsyncIterable(entry.content)),
        ),
        originalPath,
      }

      yield async () => buildFile(file, blockstore)
    } else if (entry.path != null) {
      const dir = {
        path: entry.path,
        mtime: entry.mtime,
        mode: entry.mode,
        originalPath,
      }

      yield async () => buildDir(dir, blockstore)
    } else {
      throw new Error('Import candidate must have content or path or both')
    }
  }
}

// --- directory tree ---

interface DirProps {
  root: boolean
  dir: boolean
  path: string
  dirty: boolean
  flat: boolean
  parent?: Dir
  parentKey?: string
  unixfs?: UnixFS
  mode?: number
  mtime?: Mtime
}

abstract class Dir {
  root: boolean
  dir: boolean
  path: string
  dirty: boolean
  flat: boolean
  parent?: Dir
  parentKey?: string
  unixfs?: UnixFS
  mode?: number
  mtime?: Mtime
  cid?: CID
  size?: number
  nodeSize?: number

  constructor(props: DirProps) {
    this.root = props.root
    this.dir = props.dir
    this.path = props.path
    this.dirty = props.dirty
    this.flat = props.flat
    this.parent = props.parent
    this.parentKey = props.parentKey
    this.unixfs = props.unixfs
    this.mode = props.mode
    this.mtime = props.mtime
  }

  abstract put(name: string, value: InProgressImportResult | Dir): Promise<void>
  abstract get(name: string): Promise<InProgressImportResult | Dir | undefined>
  abstract eachChildSeries(): Iterable<{
    key: string
    child: InProgressImportResult | Dir
  }>
  abstract flush(blockstore: WritableStorage): AsyncGenerator<ImportResult>
  abstract estimateNodeSize(): Promise<number>
  abstract childCount(): number
}

/** UTF-8 byte length of `str` without allocating an encoded copy. */
function utf8ByteLength(str: string): number {
  let len = 0

  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)

    if (c < 0x80) {
      len++
    } else if (c < 0x800) {
      len += 2
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      // surrogate pair -> one code point -> 4 UTF-8 bytes
      i++
      len += 4
    } else {
      len += 3
    }
  }

  return len
}

/**
 * Sharding decision metric, matching go-unixfsnode: the summed size of link
 * names plus link CIDs, ignoring protobuf framing.
 *
 * @see https://github.com/ipfs/go-unixfsnode/blob/37b47f1/data/builder/directory.go#L81-L96
 */
function estimateLinkSize(
  nameBytes: number,
  child: InProgressImportResult | Dir | undefined,
): number {
  if (child?.cid != null && child?.size != null) {
    return nameBytes + child.cid.byteLength
  }

  return 0
}

class DirFlat extends Dir {
  private readonly _children: Map<string, InProgressImportResult | Dir>

  constructor(props: DirProps) {
    super(props)
    this._children = new Map()
  }

  async put(name: string, value: InProgressImportResult | Dir): Promise<void> {
    if (this.nodeSize !== undefined) {
      // Keep the running estimate current rather than rescanning every child
      // on each insert — `flatToShard` asks for it after every put.
      const oldChild = this._children.get(name)
      const nameBytes = utf8ByteLength(name)

      this.nodeSize -= estimateLinkSize(nameBytes, oldChild)
      this.nodeSize += estimateLinkSize(nameBytes, value)

      if (this.nodeSize < 0) {
        this.nodeSize = undefined
      }
    }

    this.cid = undefined
    this.size = undefined
    this._children.set(name, value)
  }

  async get(name: string): Promise<InProgressImportResult | Dir | undefined> {
    return this._children.get(name)
  }

  childCount(): number {
    return this._children.size
  }

  *eachChildSeries(): Iterable<{
    key: string
    child: InProgressImportResult | Dir
  }> {
    for (const [key, child] of this._children.entries()) {
      yield { key, child }
    }
  }

  async estimateNodeSize(): Promise<number> {
    if (this.nodeSize !== undefined) {
      return this.nodeSize
    }

    this.nodeSize = 0

    for (const [name, child] of this._children.entries()) {
      this.nodeSize += estimateLinkSize(utf8ByteLength(name), child)
    }

    return this.nodeSize
  }

  async *flush(block: WritableStorage): AsyncGenerator<ImportResult> {
    const links: PBLink[] = []

    for (const [name, child] of this._children.entries()) {
      let result: { size?: bigint | number; cid?: CID } = child

      if (child instanceof Dir) {
        for await (const entry of child.flush(block)) {
          result = entry
          yield entry
        }
      }

      if (result.size != null && result.cid != null) {
        links.push({ Name: name, Tsize: Number(result.size), Hash: result.cid })
      }
    }

    const unixfs = new UnixFS({
      type: 'directory',
      mtime: this.mtime,
      mode: this.mode,
    })
    const node: PBNode = { Data: unixfs.marshal(), Links: links }
    const buffer = encode(prepare(node))
    const cid = await persist(buffer, block, { cidVersion: CID_VERSION })
    const size =
      buffer.length +
      node.Links.reduce((acc, curr) => acc + (curr.Tsize ?? 0), 0)

    this.cid = cid
    this.size = size

    yield { cid, unixfs, path: this.path, size: BigInt(size) }
  }
}

// --- HAMT-sharded directories ---

/**
 * go-ipfs truncates murmur3-128 to its first 64 bits and stores them
 * little-endian; both quirks are load-bearing for CID parity.
 */
async function hamtHashFn(buf: Uint8Array): Promise<Uint8Array> {
  // `.digest` is exactly the raw murmur3-128 output that upstream reads via
  // the untyped `.encode()`; going through `digest()` keeps this type-safe.
  const { digest } = await murmur3128.digest(buf)

  return digest.slice(0, 8).reverse()
}

/** Sink used to size a shard without writing its scratch blocks. */
const blackHole: WritableStorage = { put: async (cid: CID) => cid }

class DirSharded extends Dir {
  readonly bucket: Bucket<InProgressImportResult | Dir>

  constructor(props: DirProps) {
    super(props)
    this.bucket = createHAMT({ hashFn: hamtHashFn, bits: SHARD_FANOUT_BITS })
  }

  async put(name: string, value: InProgressImportResult | Dir): Promise<void> {
    this.cid = undefined
    this.size = undefined
    this.nodeSize = undefined

    await this.bucket.put(name, value)
  }

  async get(name: string): Promise<InProgressImportResult | Dir | undefined> {
    return this.bucket.get(name)
  }

  childCount(): number {
    return this.bucket.leafCount()
  }

  onlyChild():
    | Bucket<InProgressImportResult | Dir>
    | BucketChild<InProgressImportResult | Dir> {
    return this.bucket.onlyChild()
  }

  *eachChildSeries(): Iterable<{
    key: string
    child: InProgressImportResult | Dir
  }> {
    for (const { key, value } of this.bucket.eachLeafSeries()) {
      yield { key, child: value }
    }
  }

  async estimateNodeSize(): Promise<number> {
    if (this.nodeSize !== undefined) {
      return this.nodeSize
    }

    this.nodeSize = (await calculateShardSize(this.bucket, this)).size

    return this.nodeSize
  }

  async *flush(blockstore: WritableStorage): AsyncGenerator<ImportResult> {
    for await (const entry of flushShard(this.bucket, blockstore, this)) {
      yield { ...entry, path: this.path }
    }
  }
}

function isDir(obj: unknown): obj is Dir {
  return typeof (obj as Dir)?.flush === 'function'
}

/** Build the UnixFS node describing one HAMT bucket. */
function shardNode(
  bucket: Bucket<InProgressImportResult | Dir>,
  shardRoot: DirSharded | null,
  links: PBLink[],
): { node: PBNode; dir: UnixFS } {
  // go-ipfs stores the occupancy bitfield little-endian
  const data = Uint8Array.from(bucket._children.bitField().reverse())
  const dir = new UnixFS({
    type: 'hamt-sharded-directory',
    data,
    fanout: BigInt(bucket.tableSize()),
    hashType: SHARD_HASH_CODE,
    mtime: shardRoot?.mtime,
    mode: shardRoot?.mode,
  })

  return { node: { Data: dir.marshal(), Links: links }, dir }
}

async function* flushShard(
  bucket: Bucket<InProgressImportResult | Dir>,
  blockstore: WritableStorage,
  shardRoot: DirSharded | null,
): AsyncIterable<ImportResult> {
  const children = bucket._children
  const padLength = (bucket.tableSize() - 1).toString(16).length
  const links: PBLink[] = []
  let childrenSize = 0n

  for (let i = 0; i < children.length; i++) {
    const child = children.get(i)

    if (child == null) {
      continue
    }

    const labelPrefix = i.toString(16).toUpperCase().padStart(padLength, '0')

    if (child instanceof Bucket) {
      let shard: ImportResult | undefined

      for await (const subShard of flushShard(child, blockstore, null)) {
        shard = subShard
      }

      if (shard == null) {
        throw new Error('Could not flush sharded directory, no sub-shard found')
      }

      links.push({
        Name: labelPrefix,
        Tsize: Number(shard.size),
        Hash: shard.cid,
      })
      childrenSize += shard.size
    } else if (isDir(child.value)) {
      let flushedDir: ImportResult | undefined

      for await (const entry of child.value.flush(blockstore)) {
        flushedDir = entry
        yield flushedDir
      }

      if (flushedDir == null) {
        throw new Error('Did not flush dir')
      }

      links.push({
        Name: labelPrefix + child.key,
        Tsize: Number(flushedDir.size),
        Hash: flushedDir.cid,
      })
      childrenSize += flushedDir.size
    } else {
      const value = child.value

      if (value.cid == null) {
        continue
      }

      links.push({
        Name: labelPrefix + child.key,
        Tsize: Number(value.size),
        Hash: value.cid,
      })
      childrenSize += BigInt(value.size ?? 0)
    }
  }

  const { node, dir } = shardNode(bucket, shardRoot, links)
  const buffer = encode(prepare(node))
  const cid = await persist(buffer, blockstore, { cidVersion: CID_VERSION })

  yield { cid, unixfs: dir, size: BigInt(buffer.byteLength) + childrenSize }
}

async function calculateShardSize(
  bucket: Bucket<InProgressImportResult | Dir>,
  shardRoot: DirSharded | null,
): Promise<{ cid: CID; size: number }> {
  const children = bucket._children
  const padLength = (bucket.tableSize() - 1).toString(16).length
  const links: PBLink[] = []
  let sizeEstimate = 0

  for (let i = 0; i < children.length; i++) {
    const child = children.get(i)

    if (child == null) {
      continue
    }

    const labelPrefix = i.toString(16).toUpperCase().padStart(padLength, '0')

    if (child instanceof Bucket) {
      const { size, cid } = await calculateShardSize(child, null)

      links.push({ Name: labelPrefix, Tsize: Number(size), Hash: cid })
      sizeEstimate += labelPrefix.length + cid.byteLength
    } else if (isDir(child.value)) {
      const dir = child.value

      if (dir.cid == null) {
        throw new Error('Child directory has not been persisted')
      }

      links.push({
        Name: labelPrefix + child.key,
        Tsize: Number(dir.nodeSize),
        Hash: dir.cid,
      })
      sizeEstimate += labelPrefix.length + dir.cid.byteLength
    } else {
      const value = child.value

      links.push({
        Name: labelPrefix + child.key,
        Tsize: Number(value.size),
        Hash: value.cid,
      })
      sizeEstimate += labelPrefix.length + value.cid.byteLength
    }
  }

  const { node } = shardNode(bucket, shardRoot, links)
  const cid = await persist(encode(prepare(node)), blackHole, {
    cidVersion: CID_VERSION,
  })

  return { cid, size: sizeEstimate }
}

/**
 * Convert `dir` to a shard if it has outgrown the threshold, then walk up the
 * parent chain doing the same — a child converting makes its parent's links
 * change, which can push the parent over in turn.
 */
async function flatToShard(child: Dir | null, dir: Dir): Promise<Dir> {
  let newDir = dir

  if (
    dir instanceof DirFlat &&
    (await dir.estimateNodeSize()) > SHARD_SPLIT_THRESHOLD_BYTES
  ) {
    newDir = await convertToShard(dir)
  }

  const parent = newDir.parent

  if (parent != null) {
    if (newDir !== dir) {
      if (child != null) {
        child.parent = newDir
      }

      if (newDir.parentKey == null) {
        throw new Error('No parent key found')
      }

      await parent.put(newDir.parentKey, newDir)
    }

    return flatToShard(newDir, parent)
  }

  return newDir
}

async function convertToShard(oldDir: DirFlat): Promise<DirSharded> {
  const newDir = new DirSharded({
    root: oldDir.root,
    dir: true,
    parent: oldDir.parent,
    parentKey: oldDir.parentKey,
    path: oldDir.path,
    dirty: oldDir.dirty,
    flat: false,
    mtime: oldDir.mtime,
    mode: oldDir.mode,
  })

  for (const { key, child } of oldDir.eachChildSeries()) {
    await newDir.put(key, child)
  }

  return newDir
}

/** Split on `/` unless escaped with a backslash. */
const toPathComponents = (path = ''): string[] =>
  path.split(/(?<!\\)\//).filter(Boolean)

async function addToTree(
  elem: InProgressImportResult,
  tree: Dir,
): Promise<Dir> {
  const pathElems = toPathComponents(elem.path ?? '')
  const lastIndex = pathElems.length - 1
  let parent = tree
  let currentPath = ''

  for (let i = 0; i < pathElems.length; i++) {
    const pathElem = pathElems[i]

    currentPath += `${currentPath !== '' ? '/' : ''}${pathElem}`

    const last = i === lastIndex
    parent.dirty = true
    parent.cid = undefined
    parent.size = undefined

    if (last) {
      await parent.put(pathElem, elem)
      tree = await flatToShard(null, parent)
    } else {
      let dir = await parent.get(pathElem)

      if (dir == null || !(dir instanceof Dir)) {
        dir = new DirFlat({
          root: false,
          dir: true,
          parent,
          parentKey: pathElem,
          path: currentPath,
          dirty: true,
          flat: true,
          mtime: dir?.unixfs?.mtime,
          mode: dir?.unixfs?.mode,
        })
      }

      await parent.put(pathElem, dir)
      parent = dir
    }
  }

  return tree
}

async function* treeBuilder(
  source: AsyncIterable<InProgressImportResult>,
  block: WritableStorage,
): AsyncIterable<ImportResult> {
  let tree: Dir = new DirFlat({
    root: true,
    dir: true,
    path: '',
    dirty: true,
    flat: true,
  })

  for await (const entry of source) {
    if (entry == null) {
      continue
    }

    tree = await addToTree(entry, tree)

    if (entry.unixfs?.isDirectory() !== true) {
      yield entry
    }
  }

  yield* tree.flush(block)
}

/**
 * Build a UnixFS DAG from `source`, writing every block to `blockstore` and
 * yielding an entry per file plus one per directory, root last.
 *
 * All entries are wrapped in a single root directory.
 */
export async function* importer(
  source: AsyncIterable<ImportCandidate> | Iterable<ImportCandidate>,
  blockstore: WritableStorage,
): AsyncGenerator<ImportResult, void, unknown> {
  const dags = parallelBatch(
    dagBuilder(source, blockstore),
    FILE_IMPORT_CONCURRENCY,
  )

  for await (const entry of treeBuilder(dags, blockstore)) {
    yield {
      cid: entry.cid,
      path: entry.path,
      unixfs: entry.unixfs,
      size: entry.size,
    }
  }
}
