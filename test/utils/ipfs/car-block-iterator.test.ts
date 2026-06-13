import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import { fromIterable } from '../../../src/utils/ipfs/car-block-iterator.js'
import { packCAR } from '../../../src/utils/ipfs.js'

describe('fromIterable', () => {
  it('should decode a valid CAR from an async iterable', async () => {
    const { bytes } = await packCAR(
      [{ path: 'hello.txt', content: new TextEncoder().encode('hello') }],
      'test-valid',
    )

    async function* gen() {
      yield bytes
    }

    const { version, roots, iterator } = await fromIterable(gen())

    assert.strictEqual(version, 1)
    assert.strictEqual(roots.length, 1)
    assert.ok(roots[0].toString().startsWith('bafy'))

    const blocks: { cid: unknown; bytes: Uint8Array }[] = []
    for await (const block of iterator) {
      blocks.push(block)
    }
    assert.ok(blocks.length > 0)
    assert.ok(blocks.some((b) => b.cid.toString() === roots[0].toString()))
  })

  it('should handle multi-block CAR', async () => {
    const { bytes } = await packCAR(
      [
        {
          path: 'a.txt',
          content: new TextEncoder().encode('a'.repeat(300 * 1024)),
        },
      ],
      'test-chunked',
    )

    async function* gen() {
      const chunkSize = Math.ceil(bytes.length / 3)
      for (let i = 0; i < bytes.length; i += chunkSize) {
        yield bytes.subarray(i, i + chunkSize)
      }
    }

    const { version, iterator } = await fromIterable(gen())
    assert.strictEqual(version, 1)

    const blocks: unknown[] = []
    for await (const block of iterator) {
      blocks.push(block)
    }
    assert.ok(blocks.length > 1, 'chunked file should produce multiple blocks')
  })

  it('should decode CAR streamed in small chunks', async () => {
    const { bytes } = await packCAR(
      [{ path: 'small.txt', content: new TextEncoder().encode('data') }],
      'test-streamed',
    )

    async function* gen() {
      for (let i = 0; i < bytes.length; i += 16) {
        yield bytes.subarray(i, i + 16)
      }
    }

    const { version, roots, iterator } = await fromIterable(gen())
    assert.strictEqual(version, 1)
    assert.strictEqual(roots.length, 1)

    const blocks: unknown[] = []
    for await (const block of iterator) {
      blocks.push(block)
    }
    assert.ok(blocks.length > 0)
  })

  it('should throw TypeError for non-async-iterable input', async () => {
    await assert.rejects(
      () => fromIterable(null as unknown as AsyncIterable<Uint8Array>),
      { name: 'TypeError' },
    )
    await assert.rejects(() => fromIterable({} as AsyncIterable<Uint8Array>), {
      name: 'TypeError',
    })
  })

  it('should reject for invalid CAR data', async () => {
    async function* gen() {
      yield new Uint8Array([0, 1, 2, 3, 4, 5])
    }

    await assert.rejects(() => fromIterable(gen()))
  })
})
