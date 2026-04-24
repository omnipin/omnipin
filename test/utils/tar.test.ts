import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import { Readable } from 'node:stream'
import { parseTar } from 'nanotar'
import { packTAR } from '../../src/utils/tar.js'

const te = new TextEncoder()

const makeFile = (path: string, body: string) => ({
  path,
  content: Readable.from([te.encode(body)]) as unknown as ReturnType<
    typeof import('node:fs').createReadStream
  >,
})

describe('tar utils', () => {
  describe('packTAR', () => {
    it('packs files into a TAR and returns bytes without writing when no name', async () => {
      const files = [
        makeFile('a.txt', 'File A'),
        makeFile('nested/b.txt', 'File B'),
      ]

      const { bytes, output } = await packTAR(files)

      assert.ok(bytes instanceof Uint8Array)
      assert.equal(output, null)

      const entries = parseTar(bytes)
      assert.equal(entries.length, 2)
      assert.deepEqual(entries.map((e) => e.name).sort(), [
        'a.txt',
        'nested/b.txt',
      ])
    })

    it('writes TAR to disk when name is provided', async () => {
      const { tmpdir } = await import('node:os')
      const { readFile, unlink } = await import('node:fs/promises')

      const files = [makeFile('hello.txt', 'hello world')]
      const { bytes, output } = await packTAR(files, 'packtar-test', tmpdir())

      assert.ok(output?.endsWith('packtar-test.tar'))
      const onDisk = await readFile(output as string)
      assert.ok(onDisk.equals(bytes))
      await unlink(output as string)
    })
  })
})
