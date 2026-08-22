import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import { MemoryBlockstore } from '../../../src/utils/ipfs/blockstore.js'
import { importer } from '../../../src/utils/ipfs/unixfs.js'
import { cases } from '../../fixtures/unixfs-cases.js'
import goldens from '../../fixtures/unixfs-goldens.json' with { type: 'json' }

type Golden = {
  root: string
  blocks: number
  entries: Array<{ path?: string; cid: string; size: string }>
}

// `src/utils/ipfs/unixfs.ts` is a vendored, single-configuration copy of
// `ipfs-unixfs-importer@17.0.1`. These CIDs were captured from the upstream
// package before vendoring, so they pin the vendored copy to upstream's
// exact DAG layout. A CID change here is a change to every deploy's content
// address -- if one of these fails, the vendored importer is wrong, not the
// fixture.
describe('vendored unixfs importer', () => {
  describe('upstream parity', () => {
    for (const { name, files } of cases) {
      it(`produces upstream's DAG for ${name}`, async () => {
        const golden = (goldens as Record<string, Golden>)[name]
        assert.ok(golden, `no golden captured for ${name}`)

        const blockstore = new MemoryBlockstore()
        const entries: Golden['entries'] = []

        // structuredClone: the importer normalises `path` in place
        for await (const entry of importer(
          structuredClone(files),
          blockstore,
        )) {
          entries.push({
            path: entry.path,
            cid: entry.cid.toString(),
            size: String(entry.size),
          })
        }

        let blocks = 0
        for await (const _ of blockstore.getAll()) blocks++
        blockstore.clear()

        assert.strictEqual(entries.at(-1)?.cid, golden.root, 'root CID')
        assert.deepStrictEqual(entries, golden.entries, 'yielded entries')
        assert.strictEqual(blocks, golden.blocks, 'block count')
      })
    }
  })

  it('rejects a candidate with neither content nor path', async () => {
    const blockstore = new MemoryBlockstore()
    await assert.rejects(async () => {
      for await (const _ of importer([{} as never], blockstore)) {
        // consume
      }
    }, /Import candidate must have content or path or both/)
  })

  it('rejects content that is not bytes', async () => {
    const blockstore = new MemoryBlockstore()
    await assert.rejects(async () => {
      for await (const _ of importer(
        [{ path: 'bad.txt', content: { length: 3 } as never }],
        blockstore,
      )) {
        // consume
      }
    }, /Content was invalid/)
  })

  it('encodes string chunks as utf-8', async () => {
    // a ReadStream opened with an encoding yields strings, not Buffers
    const blockstore = new MemoryBlockstore()
    const stringly = { path: 'a.txt', content: ['héllo 🌸'] as never }
    const bytes = {
      path: 'a.txt',
      content: new TextEncoder().encode('héllo 🌸'),
    }

    const roots: string[] = []
    for (const files of [[stringly], [bytes]]) {
      let root = ''
      for await (const entry of importer(files as never, blockstore)) {
        root = entry.cid.toString()
      }
      roots.push(root)
    }
    blockstore.clear()

    assert.strictEqual(roots[0], roots[1])
  })
})
