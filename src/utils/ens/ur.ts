import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { fromString, toHex } from 'ox/Bytes'
import { labelhash } from 'ox/Ens'
import type { Provider } from 'ox/Provider'
import { InvalidLabelhashError } from '../../errors.js'
import { encodeEnsAddressRecordRequest } from './addr.js'

const abi = {
  inputs: [
    {
      name: 'name',
      type: 'bytes',
    },
    {
      name: 'data',
      type: 'bytes',
    },
  ],
  name: 'resolve',
  outputs: [
    {
      name: 'data',
      type: 'bytes',
    },
    {
      name: 'resolver',
      type: 'address',
    },
  ],
  stateMutability: 'view',
  type: 'function',
} as const

function encodeLabelhash(hash: string) {
  if (!hash.startsWith('0x'))
    throw new InvalidLabelhashError({
      labelhash: hash,
      details: 'Expected labelhash to start with 0x',
    })

  if (hash.length !== 66)
    throw new InvalidLabelhashError({
      labelhash: hash,
      details: 'Expected labelhash to have a length of 66',
    })

  return `[${hash.slice(2)}]`
}

function packetToBytes(packet: string): Uint8Array {
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

export const resolveEnsName = async ({
  provider,
  name,
}: {
  provider: Provider
  name: string
}): Promise<Address> => {
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [
          toHex(packetToBytes(name)),
          encodeEnsAddressRecordRequest(name),
        ]),
        to: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe',
      },
      'latest',
    ],
  })

  return `0x${decodeResult(abi, result)[0].slice(-40)}`
}
