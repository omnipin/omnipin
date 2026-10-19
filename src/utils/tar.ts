import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createTar, type TarFileItem } from 'nanotar'
import type { FileEntry } from '../types.js'

const tmp = tmpdir()

/** Path of the archive `packTAR` writes for `name`. */
export const tarOutputPath = (name: string, dir: string = tmp): string =>
  `${dir}/${name}.tar`

export const packTAR = async (
  files: Omit<FileEntry, 'size'>[],
  name?: string,
  dir: string = tmp,
): Promise<{ bytes: Uint8Array; output: string | null }> => {
  const entries: TarFileItem[] = []

  for (const { path, content } of files) {
    const chunks = await Array.fromAsync(content)

    let totalLength = 0
    for (const c of chunks) totalLength += c.length

    const fileData = new Uint8Array(totalLength)
    let offset = 0
    for (const c of chunks) {
      fileData.set(c, offset)
      offset += c.length
    }

    entries.push({
      name: path,
      data: fileData,
    })
  }

  const bytes = createTar(entries) as Uint8Array

  if (!name) return { bytes, output: null }

  const output = tarOutputPath(name, dir)
  await writeFile(output, bytes)
  return { bytes, output }
}
