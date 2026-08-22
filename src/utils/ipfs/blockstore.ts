import type { AbortOptions } from 'abort-error'
import type { Blockstore, InputPair, Pair } from 'interface-blockstore'
import { NotFoundError } from 'interface-store'
import { base32 } from 'multiformats/bases/base32'
import type { CID } from 'multiformats/cid'

// interface-store v8 dropped these helpers and moved `AbortOptions` to
// `abort-error`. They only ever meant "sync or async", so keep them local.
type Await<T> = T | Promise<T>
type AwaitIterable<T> = Iterable<T> | AsyncIterable<T>
type AwaitGenerator<T> = Generator<T> | AsyncGenerator<T>

type Entry = {
  cid: CID
  bytes: Uint8Array[]
}

export class MemoryBlockstore implements Blockstore {
  private readonly data: Map<string, Entry>

  constructor() {
    this.data = new Map()
  }

  async *putMany(
    source: AwaitIterable<InputPair>,
    options?: AbortOptions,
  ): AwaitGenerator<CID> {
    for await (const { cid, bytes } of source) {
      await this.put(cid, bytes, options)
      yield cid
    }
  }

  async *getMany(
    source: AwaitIterable<CID>,
    options?: AbortOptions,
  ): AwaitGenerator<Pair> {
    for await (const key of source) {
      yield {
        cid: key,
        bytes: this.get(key, options),
      }
    }
  }

  async *deleteMany(
    source: AwaitIterable<CID>,
    options?: AbortOptions,
  ): AwaitGenerator<CID> {
    for await (const key of source) {
      await this.delete(key, options)
      yield key
    }
  }

  put(
    key: CID,
    val: Uint8Array | AwaitIterable<Uint8Array>,
    options?: AbortOptions,
  ): Await<CID> {
    options?.signal?.throwIfAborted()

    if (val instanceof Uint8Array) {
      return this._put(key, [val], options)
    }

    // Only an async source forces a promise here. `Array.fromAsync` always
    // returns one, so sync iterables take the spread to stay synchronous.
    if (Symbol.asyncIterator in val) {
      return Array.fromAsync(val).then((bytes) =>
        this._put(key, bytes, options),
      )
    }

    return this._put(key, [...val], options)
  }

  private _put(
    key: CID,
    val: Uint8Array[],
    options?: AbortOptions,
  ): Await<CID> {
    options?.signal?.throwIfAborted()

    this.data.set(base32.encode(key.multihash.bytes), { cid: key, bytes: val })

    return key
  }

  *get(key: CID, options?: AbortOptions): AwaitGenerator<Uint8Array> {
    options?.signal?.throwIfAborted()
    const entry = this.data.get(base32.encode(key.multihash.bytes))

    if (entry == null) {
      throw new NotFoundError()
    }

    yield* entry.bytes
  }

  has(key: CID, options?: AbortOptions): Await<boolean> {
    options?.signal?.throwIfAborted()
    return this.data.has(base32.encode(key.multihash.bytes))
  }

  async delete(key: CID, options?: AbortOptions): Promise<void> {
    options?.signal?.throwIfAborted()
    this.data.delete(base32.encode(key.multihash.bytes))
  }

  clear(): void {
    this.data.clear()
  }

  *getAll(options?: AbortOptions): AwaitGenerator<Pair> {
    options?.signal?.throwIfAborted()

    for (const { cid, bytes } of this.data.values()) {
      yield {
        cid,
        bytes: (async function* () {
          yield* bytes
        })(),
      }
      options?.signal?.throwIfAborted()
    }
  }
}
