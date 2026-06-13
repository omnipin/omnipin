import { fromString } from 'ox/Bytes'
import { labelhash } from 'ox/Ens'
import type { Hex } from 'ox/Hex'
import { InvalidLabelhashError } from '../../errors.js'

function encodeLabelhash(hash: Hex) {
  if (hash.length !== 66)
    throw new InvalidLabelhashError({
      labelhash: hash,
      details: 'Expected labelhash to have a length of 66',
    })

  return `[${hash.slice(2)}]`
}

export function packetToBytes(packet: string): Uint8Array {
  // strip leading and trailing `.`
  const value = packet.replace(/^\.|\.$/gm, '')
  if (value.length === 0) return new Uint8Array(1)

  const bytes = new Uint8Array(fromString(value).byteLength + 2)

  let offset = 0
  const list = value.split('.')
  for (let i = 0; i < list.length; i += 1) {
    let encoded = fromString(list[i])
    // if the length is > 255, make the encoded label value a labelhash
    // this is compatible with the universal resolver
    if (encoded.byteLength > 255)
      encoded = fromString(encodeLabelhash(labelhash(list[i])))
    bytes[offset] = encoded.length
    bytes.set(encoded, offset + 1)
    offset += encoded.length + 1
  }

  if (bytes.byteLength !== offset + 1) return bytes.slice(0, offset + 1)

  return bytes
}
