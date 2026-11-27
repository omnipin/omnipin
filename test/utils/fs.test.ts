import * as assert from 'node:assert'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
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
    describe('dot-paths', () => {
      // Dot-paths are skipped unless listed: a blanket include would publish
      // `.env` and the like. Sites still need some, e.g. `.well-known/`.
      const withDotfiles = async (
        fn: (dir: string) => Promise<void>,
      ): Promise<void> => {
        const dir = await mkdtemp(path.join(tmpdir(), 'omnipin-walk-'))
        try {
          await mkdir(path.join(dir, '.well-known'))
          await mkdir(path.join(dir, '.git'))
          await writeFile(path.join(dir, 'index.html'), 'hi')
          await writeFile(path.join(dir, '.env'), 'SECRET=1')
          await writeFile(path.join(dir, '.nojekyll'), '')
          await writeFile(path.join(dir, '.well-known/atproto-did'), 'did')
          await writeFile(path.join(dir, '.git/HEAD'), 'ref')
          await fn(dir)
        } finally {
          await rm(dir, { recursive: true, force: true })
        }
      }
      const paths = (files: { path: string }[]) =>
        files.map(({ path }) => path).sort()

      it('skips all dot-paths by default', () =>
        withDotfiles(async (dir) => {
          const [, files] = await walk(dir)
          assert.deepStrictEqual(paths(files), ['index.html'])
        }))

      it('includes only the listed dot files and directories', () =>
        withDotfiles(async (dir) => {
          const [, files] = await walk(dir, false, ['.well-known', '.nojekyll'])
          assert.deepStrictEqual(paths(files), [
            '.nojekyll',
            '.well-known/atproto-did',
            'index.html',
          ])
        }))
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
