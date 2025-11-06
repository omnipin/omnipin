import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { type FilecoinChain, filProvider } from './constants.js'

const abi = {
  type: 'function',
  name: 'getProviderIdByAddress',
  stateMutability: 'view',
  inputs: [
    {
      name: 'providerAddress',
      type: 'address',
    },
  ],
  outputs: [
    {
      name: '',
      type: 'uint256',
    },
  ],
} as const

export const getProviderIdByAddress = async ({
  providerAddress,
  chain,
}: {
  providerAddress: Address
  chain: FilecoinChain
}): Promise<bigint> => {
  const provider = filProvider[chain.id]
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [providerAddress]),
        to: chain.contracts.proxy.address,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
