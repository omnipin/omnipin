import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createTar, type TarFileItem } from 'nanotar'
import type { FileEntry } from '../types.js'

const tmp = tmpdir()

export const packTAR = async (
  files: Omit<FileEntry, 'size'>[],
  name?: string,
  dir: string = tmp,
): Promise<{ bytes: Uint8Array; output: string | null }> => {
  const entries: TarFileItem[] = []

  for (const { path, content } of files) {
    const chunks: Uint8Array[] = []
    let totalLength = 0

    for await (const chunk of content) {
      chunks.push(chunk)
      totalLength += chunk.length
    }

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

  const output = `${dir}/${name}.tar`
  await writeFile(output, bytes)
  return { bytes, output }
}
