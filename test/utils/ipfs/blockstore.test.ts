import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import { NotFoundError } from 'interface-store'
import all from 'it-all'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { MemoryBlockstore } from '../../../src/utils/ipfs/blockstore.js'

async function makeCID(content: string): Promise<CID> {
  const bytes = new TextEncoder().encode(content)
  const hash = await sha256.digest(bytes)
  return CID.createV1(raw.code, hash)
}

describe('MemoryBlockstore', () => {
  describe('put / get', () => {
    it('should put and get a Uint8Array value', async () => {
      const bs = new MemoryBlockstore()
      const cid = await makeCID('hello')
      const val = new TextEncoder().encode('hello')

      const result = await bs.put(cid, val)
      assert.strictEqual(result, cid)

      const chunks: Uint8Array[] = []
      for await (const chunk of bs.get(cid)) {
        chunks.push(chunk)
      }
      assert.deepStrictEqual(Buffer.concat(chunks), Buffer.from('hello'))
    })

    it('should put and get an async iterable value', async () => {
      const bs = new MemoryBlockstore()
      const cid = await makeCID('world')
      const val = (async function* () {
        yield new TextEncoder().encode('wo')
        yield new TextEncoder().encode('rld')
      })()

      await bs.put(cid, val)
      const chunks: Uint8Array[] = []
      for await (const chunk of bs.get(cid)) {
        chunks.push(chunk)
      }
      assert.deepStrictEqual(Buffer.concat(chunks), Buffer.from('world'))
    })
  })

  describe('has', () => {
    it('should return true for existing key', async () => {
      const bs = new MemoryBlockstore()
      const cid = await makeCID('foo')
      await bs.put(cid, new TextEncoder().encode('foo'))
      assert.strictEqual(await bs.has(cid), true)
    })

    it('should return false for missing key', async () => {
      const bs = new MemoryBlockstore()
      const cid = await makeCID('bar')
      assert.strictEqual(await bs.has(cid), false)
    })
  })

  describe('get - missing key', () => {
    it('should throw NotFoundError', () => {
      const bs = new MemoryBlockstore()
      const cidPromise = makeCID('nope')

      assert.rejects(
        (async () => {
          const cid = await cidPromise
          const gen = bs.get(cid)
          // Advance the generator — the throw happens during iteration
          for await (const _ of gen) {
            // noop
          }
        })(),
        NotFoundError,
      )
    })
  })

  describe('delete', () => {
    it('should remove a stored key', async () => {
      const bs = new MemoryBlockstore()
      const cid = await makeCID('delete-me')
      await bs.put(cid, new TextEncoder().encode('delete-me'))
      await bs.delete(cid)
      assert.strictEqual(await bs.has(cid), false)
    })

    it('should succeed on non-existent key', async () => {
      const bs = new MemoryBlockstore()
      const cid = await makeCID('not-there')
      await bs.delete(cid)
    })
  })

  describe('clear', () => {
    it('should remove all entries', async () => {
      const bs = new MemoryBlockstore()
      const cid1 = await makeCID('one')
      const cid2 = await makeCID('two')
      await bs.put(cid1, new TextEncoder().encode('one'))
      await bs.put(cid2, new TextEncoder().encode('two'))
      bs.clear()
      assert.strictEqual(await bs.has(cid1), false)
      assert.strictEqual(await bs.has(cid2), false)
    })
  })

  describe('putMany', () => {
    it('should put multiple entries and yield CIDs', async () => {
      const bs = new MemoryBlockstore()
      const cid1 = await makeCID('a')
      const cid2 = await makeCID('b')
      const source = (async function* () {
        yield { cid: cid1, bytes: new TextEncoder().encode('a') }
        yield { cid: cid2, bytes: new TextEncoder().encode('b') }
      })()

      const results = await all(bs.putMany(source))
      assert.deepStrictEqual(results, [cid1, cid2])
      assert.strictEqual(await bs.has(cid1), true)
      assert.strictEqual(await bs.has(cid2), true)
    })
  })

  describe('getMany', () => {
    it('should yield pairs for existing CIDs', async () => {
      const bs = new MemoryBlockstore()
      const cid1 = await makeCID('x')
      const cid2 = await makeCID('y')
      await bs.put(cid1, new TextEncoder().encode('x'))
      await bs.put(cid2, new TextEncoder().encode('y'))

      const pairs = await all(
        bs.getMany(
          (async function* () {
            yield cid1
            yield cid2
          })(),
        ),
      )

      assert.strictEqual(pairs.length, 2)
      assert.strictEqual(pairs[0].cid.toString(), cid1.toString())
      assert.strictEqual(pairs[1].cid.toString(), cid2.toString())
    })
  })

  describe('deleteMany', () => {
    it('should delete multiple keys', async () => {
      const bs = new MemoryBlockstore()
      const cid1 = await makeCID('del1')
      const cid2 = await makeCID('del2')
      await bs.put(cid1, new TextEncoder().encode('del1'))
      await bs.put(cid2, new TextEncoder().encode('del2'))

      const results = await all(
        bs.deleteMany(
          (async function* () {
            yield cid1
            yield cid2
          })(),
        ),
      )
      assert.deepStrictEqual(results, [cid1, cid2])
      assert.strictEqual(await bs.has(cid1), false)
      assert.strictEqual(await bs.has(cid2), false)
    })
  })

  describe('getAll', () => {
    it('should yield all stored pairs', async () => {
      const bs = new MemoryBlockstore()
      const cid1 = await makeCID('all1')
      const cid2 = await makeCID('all2')
      await bs.put(cid1, new TextEncoder().encode('all1'))
      await bs.put(cid2, new TextEncoder().encode('all2'))

      const pairs: { cid: CID; bytes: AsyncIterable<Uint8Array> }[] = []
      for await (const pair of bs.getAll()) {
        pairs.push(pair)
      }

      assert.strictEqual(pairs.length, 2)
      const cids = pairs.map((p) => p.cid.toString()).sort()
      assert.ok(cids.includes(cid1.toString()))
      assert.ok(cids.includes(cid2.toString()))
    })

    it('should yield nothing for empty blockstore', async () => {
      const bs = new MemoryBlockstore()
      const pairs: unknown[] = []
      for await (const pair of bs.getAll()) {
        pairs.push(pair)
      }
      assert.strictEqual(pairs.length, 0)
    })
  })

  describe('abort signal', () => {
    it('put should throw when signal is already aborted', async () => {
      const bs = new MemoryBlockstore()
      const cid = await makeCID('abort')
      const ac = new AbortController()
      ac.abort()

      assert.throws(
        () =>
          bs.put(cid, new TextEncoder().encode('abort'), { signal: ac.signal }),
        { name: 'AbortError' },
      )
    })

    it('get should throw when signal is already aborted', () => {
      const bs = new MemoryBlockstore()
      const ac = new AbortController()
      ac.abort()

      // get returns a generator; the abort check happens before yielding
      assert.throws(
        () => {
          for (const _ of bs.get(makeCID('ignored') as unknown as CID, {
            signal: ac.signal,
          })) {
            // noop
          }
        },
        { name: 'AbortError' },
      )
    })
  })
})
