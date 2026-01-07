import { CAR, error, ok } from '@ucanto/core'
import { base58btc } from 'multiformats/bases/base58'
import type { Digest } from 'multiformats/hashes/digest'
import { sha256 } from 'multiformats/hashes/sha2'
import type { MultihashDigest, UnknownLink } from 'multiformats/link'
import * as Link from 'multiformats/link'
import { compare } from 'uint8arrays/compare'
import * as dagCBOR from './cbor.js'
import type { Position, SliceDigest } from './types.js'

const cache = new WeakMap<Uint8Array, string>()

const toBase58String = (digest: MultihashDigest) => {
  let str = cache.get(digest.bytes)
  if (!str) {
    str = base58btc.encode(digest.bytes)
    cache.set(digest.bytes, str)
  }
  return str
}

const version = 'index/sharded/dag@0.1'
export const archive = async (model: ShardedDAGIndex) => {
  const roots = []
  const blocks = new Map()
  try {
    const shards = [...model.shards.entries()].sort((a, b) =>
      compare(a[0].digest, b[0].digest),
    )
    const index = {
      content: model.content,
      shards: [] as Link.Link[],
    }
    for (const s of shards) {
      const slices = [...s[1].entries()]
        .sort((a, b) => compare(a[0].digest, b[0].digest))
        .map((e) => [e[0].bytes, e[1]])
      const bytes = dagCBOR.encode([s[0].bytes, slices])
      const digest = await sha256.digest(bytes)
      const cid = Link.create(dagCBOR.code, digest)
      blocks.set(cid.toString(), { cid, bytes })
      index.shards.push(cid)
    }
    const bytes = dagCBOR.encode({ [version]: index })
    const digest = await sha256.digest(bytes)
    const cid = Link.create(dagCBOR.code, digest)
    roots.push({ cid, bytes })
  } catch (err) {
    return error({
      name: 'EncodeFailure',
      message: `encoding DAG: ${(err as Error).message}`,
      stack: (err as Error).stack,
    })
  }

  try {
    return ok(CAR.encode({ roots, blocks }))
  } catch (err) {
    return error({
      name: 'EncodeFailure',
      message: `encoding CAR: ${(err as Error).message}`,
      stack: (err as Error).stack,
    })
  }
}

class DigestMap<Key extends MultihashDigest, Value> implements Map<Key, Value> {
  #data: Map<string, [Key, Value]>

  constructor(entries?: Array<[Key, Value]>) {
    this.#data = new Map()
    for (const [k, v] of entries ?? []) {
      this.set(k, v)
    }
  }

  get [Symbol.toStringTag]() {
    return 'DigestMap'
  }

  clear() {
    this.#data.clear()
  }

  get(key: Key): Value | undefined {
    const data = this.#data.get(toBase58String(key))
    if (data) return data[1]
  }

  set(key: Key, value: Value) {
    this.#data.set(toBase58String(key), [key, value])
    return this
  }

  [Symbol.iterator]() {
    return this.entries()
  }

  *entries(): IterableIterator<[Key, Value]> {
    yield* this.#data.values()
  }
}

export class ShardedDAGIndex {
  #content
  #shards

  constructor(content: UnknownLink) {
    this.#content = content
    this.#shards = new DigestMap<Digest<number, number>, Position>()
  }

  get content() {
    return this.#content
  }

  get shards() {
    return this.#shards
  }

  setSlice(shard: Digest<number, number>, slice: SliceDigest, pos: Position) {
    let index = this.#shards.get(shard)
    if (!index) {
      index = new DigestMap()
      this.#shards.set(shard, index)
    }
    index.set(slice, pos)
  }

  archive() {
    return archive(this)
  }
}
