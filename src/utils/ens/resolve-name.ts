import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { toHex } from 'ox/Bytes'
import type { Provider } from 'ox/Provider'
import { encodeEnsAddressRecordRequest } from './addr.js'
import { packetToBytes } from './utils.js'

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
