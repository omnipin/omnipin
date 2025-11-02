import type { PieceLink } from '@web3-storage/data-segment'
import * as Hasher from '@web3-storage/data-segment/multihash'
import * as Raw from 'multiformats/codecs/raw'
import * as Link from 'multiformats/link'

export function calculatePieceCID(data: Uint8Array): PieceLink {
  const hasher = Hasher.create()
  // We'll get slightly better performance by writing in chunks to let the
  // hasher do its work incrementally
  const chunkSize = 2048
  for (let i = 0; i < data.length; i += chunkSize) {
    hasher.write(data.subarray(i, i + chunkSize))
  }
  const digest = hasher.digest()
  return Link.create(Raw.code, digest)
}
