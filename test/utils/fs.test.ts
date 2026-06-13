import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import path from 'node:path'
import { exists, fileSize, walk } from '../../src/utils/fs.js'

describe('fs utils', () => {
  describe('walk', () => {
    it('should walk the directory, return total size and files', async () => {
      const [size, files] = await walk(
        path.resolve(import.meta.dirname, '../fixtures/walk'),
      )
      assert.strictEqual(size, 29)
      files.sort((a, b) => a.path.localeCompare(b.path)) // to prevent ordering issue
      assert.deepStrictEqual(
        files.map(({ path, size }) => ({ path, size })),
        [
          {
            path: 'a.txt',
            size: 11,
          },
          {
            path: 'b.txt',
            size: 15,
          },
          {
            path: 'c.txt',
            size: 3,
          },
        ],
      )
    })

    it('walks a directory whose name contains glob metacharacters', async () => {
      // Regression test for the `glob(dir, …)` misuse where the target
      // directory path was passed as a glob pattern. tinyglobby parses
      // parens in the pattern as group syntax, so a directory like
      // `walk (v2)/` returned zero matches silently — every directory
      // shipped with a version suffix in parens (a common naming
      // convention) was unpackable. Inner `[slug]/` is preserved as a
      // realistic Next.js / Astro / SvelteKit dynamic-route shape.
      const [size, files] = await walk(
        path.resolve(import.meta.dirname, '../fixtures/walk (v2)'),
      )
      assert.strictEqual(size, 14)
      files.sort((a, b) => a.path.localeCompare(b.path))
      assert.deepStrictEqual(
        files.map(({ path, size }) => ({ path, size })),
        [
          { path: '[slug]/index.html', size: 5 },
          { path: 'index.html', size: 3 },
          { path: 'posts/page.html', size: 6 },
        ],
      )
    })
  })
  describe('exists', () => {
    it('should return true if file exists', async () => {
      assert.strictEqual(
        await exists(
          path.resolve(import.meta.dirname, '../fixtures/walk/a.txt'),
        ),
        true,
      )
    })
    it('should return false if file does not exist', async () => {
      assert.strictEqual(
        await exists(
          path.resolve(
            import.meta.dirname,
            '../fixtures/walk/does-not-exist.txt',
          ),
        ),
        false,
      )
    })
  })
  describe('fileSize', () => {
    it('should return the file size in bytes', () => {
      assert.strictEqual(fileSize(1024), '1.0KB')
    })
  })
})
