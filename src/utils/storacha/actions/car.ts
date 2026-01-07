import type * as CarDecoder from '@ipld/car/decoder'
import { CarWriter } from '@ipld/car/writer'
import type { CID } from 'multiformats/cid'
import * as varint from 'varint'
import { fromIterable } from '../../ipfs/car-block-iterator.js'
import * as dagCBOR from '../cbor.js'
import type { AnyLink } from '../types.js'

export async function decode(car: Blob) {
  const { iterator, roots } = await fromIterable(car.stream())
  const blocks: CarDecoder.Block[] = []
  for await (const block of iterator) {
    blocks.push(block)
  }
  return { blocks, roots }
}

export const code = 0x0202
/** Byte length of a CBOR encoded CAR header with zero roots. */
const NO_ROOTS_HEADER_LENGTH = 18

export function headerEncodingLength(root?: AnyLink) {
  if (!root) return NO_ROOTS_HEADER_LENGTH
  const headerLength = dagCBOR.encode({ version: 1, roots: [root] }).length

  const varintLength = varint.encodingLength(headerLength)
  return varintLength + headerLength
}

export function blockHeaderEncodingLength(block: CarDecoder.Block) {
  const payloadLength = block.cid.bytes.length + block.bytes.length
  const varintLength = varint.encodingLength(payloadLength)
  return varintLength + block.cid.bytes.length
}

export async function encode(
  blocks: Iterable<CarDecoder.Block> | AsyncIterable<CarDecoder.Block>,
  root?: AnyLink,
) {
  const { writer, out } = CarWriter.create(root as CID)
  let error: Error | undefined
  void (async () => {
    try {
      for await (const block of blocks) {
        await writer.put(block)
      }
    } catch (err) {
      error = err as Error
    } finally {
      await writer.close()
    }
  })()
  const chunks: BlobPart[] = []
  for await (const chunk of out) chunks.push(chunk as BlobPart)
  if (error != null) throw error
  const roots = root != null ? [root] : []
  return Object.assign(new Blob(chunks), { version: 1, roots })
}
