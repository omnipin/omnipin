import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { toHex } from 'ox/Bytes'
import type { Provider } from 'ox/Provider'
import { packetToBytes } from './utils.js'

export const abi = {
  type: 'function',
  name: 'findResolver',
  inputs: [
    {
      name: 'name',
      type: 'bytes',
      internalType: 'bytes',
    },
  ],
  outputs: [
    {
      name: '',
      type: 'address',
      internalType: 'address',
    },
    {
      name: '',
      type: 'bytes32',
      internalType: 'bytes32',
    },
    {
      name: '',
      type: 'uint256',
      internalType: 'uint256',
    },
  ],
  stateMutability: 'view',
} as const

export const getEnsResolver = async ({
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
        data: encodeData(abi, [toHex(packetToBytes(name))]),
        to: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe',
      },
      'latest',
    ],
  })

  const [resolverAddress] = decodeResult(abi, result)

  return resolverAddress
}
