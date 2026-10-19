import * as assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parseTar } from 'nanotar'
import { packAction } from '../../src/actions/pack.js'

describe('pack action', () => {
  it('excludes a leftover archive from the packed tar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnipin-pack-'))
    try {
      writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>')
      // An archive left over by a previous run, in the directory being
      // deployed — it must not be shipped as site content.
      writeFileSync(join(dir, 'site.tar'), 'stale archive')

      const result = await packAction({
        dir,
        options: { name: 'site', dist: dir, tar: true },
      })

      assert.deepStrictEqual(
        result.files.map((file) => file.path),
        ['index.html'],
      )
      assert.ok(result.path)

      const entries = parseTar(result.bytes)
      assert.deepStrictEqual(
        entries.map((entry) => entry.name),
        ['index.html'],
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('packs every file when there is no leftover archive', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnipin-pack-'))
    try {
      writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>')
      writeFileSync(join(dir, 'app.js'), 'console.log(1)')

      const result = await packAction({
        dir,
        options: { name: 'site', dist: dir, tar: true },
      })

      assert.deepStrictEqual(result.files.map((file) => file.path).sort(), [
        'app.js',
        'index.html',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
