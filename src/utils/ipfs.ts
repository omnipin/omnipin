import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { CarWriter } from '@ipld/car/writer'
import { base32 } from 'multiformats/bases/base32'
import type { CID } from 'multiformats/cid'
import { InvalidCIDError } from '../errors.js'
import { MemoryBlockstore } from './ipfs/blockstore.js'
import { type FileCandidate, importer } from './ipfs/unixfs.js'

const tmp = tmpdir()

const concatBytes = (chunks: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  let total = 0
  for (const c of chunks) total += c.byteLength

  const out = new Uint8Array(total)
  let offset = 0

  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }

  return out
}

export const packCAR = async (
  files: FileCandidate[],
  name: string,
  dir = tmp,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; rootCID: CID }> => {
  const output = `${dir}/${name}.car`

  const blockstore = new MemoryBlockstore()
  let rootCID: CID | null = null

  for await (const entry of importer(files, blockstore)) {
    rootCID = entry.cid
  }

  if (!rootCID) {
    throw new Error('No files were imported')
  }

  const { writer, out } = CarWriter.create([rootCID])

  // `out` must be drained while blocks are being fed in: `CarWriter` hands
  // chunks over one at a time and `writer.put` will not resolve until the
  // previous chunk has been taken. Start collecting now, await it after the
  // writer is closed.
  const collecting = Array.fromAsync(out)

  for await (const { cid, bytes } of blockstore.getAll()) {
    try {
      await writer.put({
        cid,
        bytes: concatBytes(await Array.fromAsync(bytes)),
      })
    } catch (error) {
      console.warn(`Failed to add block ${cid.toString()} to CAR:`, error)
    }
  }

  await writer.close()
  const carChunks = await collecting

  // Release the blocks before joining the CAR chunks so peak memory stays at
  // roughly one copy of the blocks plus one copy of the CAR, as it was when
  // this read the finished file back off disk.
  blockstore.clear()

  const bytes = concatBytes(carChunks)
  carChunks.length = 0

  await writeFile(output, bytes)

  return { bytes, rootCID }
}

export const assertCID = (cid: string) => {
  if (cid.length !== 64) {
    try {
      base32.decode(cid)
    } catch {
      throw new InvalidCIDError(cid)
    }
  }
}
