import { constants, createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { relative } from 'node:path'
import { glob } from 'tinyglobby'
import type { FileEntry } from '../types.js'
import { logger } from './logger.js'

export const walk = async (
  dir: string,
  verbose = false,
): Promise<[number, FileEntry[]]> => {
  let total = 0
  const files: FileEntry[] = []
  // Use `cwd` + a `**/*` pattern instead of passing `dir` as the pattern.
  // The latter silently returns an empty list when the directory path
  // contains glob metacharacters such as `(`, `)`, `[`, `]`, `!`, `{`, `*`,
  // or `?`, because tinyglobby then interprets them as pattern syntax.
  for (const absPath of await glob('**/*', {
    cwd: dir,
    ignore: ['**/node_modules'],
    onlyFiles: true,
    absolute: true,
  })) {
    const size = (await stat(absPath)).size
    const name = relative(dir, absPath)
    if (verbose) logger.text(`${name} (${fileSize(size, 2)})`)
    total += size
    files.push({
      path: name,
      content: createReadStream(absPath),
      size,
    })
  }

  return [total, files] as const
}

export const exists = async (file: string): Promise<boolean> => {
  try {
    await access(file, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const units = ['KB', 'MB', 'GB', 'TB', 'PB']
const thresh = 1000
export function fileSize(bytes: number, digits = 1): string {
  if (Math.abs(bytes) < thresh) return `${bytes}B`

  let u = -1
  const r = 10 ** digits

  do {
    bytes /= thresh
    ++u
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  )

  return bytes.toFixed(digits) + units[u]
}
