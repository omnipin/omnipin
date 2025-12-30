import { varint } from 'multiformats'

import { create } from 'multiformats/hashes/digest'
import { type Hex, toBytes } from 'ox/Hex'

const KECCAK_256_CODEC = 0x1b
const SWARM_MANIFEST_CODEC = 0xfa

function encodeCID(
  version: 1,
  code: number,
  multihash: Uint8Array,
): Uint8Array {
  const codeOffset = varint.encodingLength(version)
  const hashOffset = codeOffset + varint.encodingLength(code)
  const bytes = new Uint8Array(hashOffset + multihash.byteLength)
  varint.encodeTo(version, bytes, 0)
  varint.encodeTo(code, bytes, codeOffset)
  bytes.set(multihash, hashOffset)
  return bytes
}

export const referenceToCID = (ref: Hex): Uint8Array =>
  encodeCID(
    1,
    SWARM_MANIFEST_CODEC,
    create(KECCAK_256_CODEC, toBytes(ref)).bytes,
  )
