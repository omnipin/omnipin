import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type Address, checksum } from 'ox/Address'
import { type FilecoinChain, filProvider } from './constants.js'

const abi = {
  type: 'function',
  name: 'getProviderPayee',
  stateMutability: 'view',
  inputs: [
    {
      name: 'providerId',
      type: 'uint256',
    },
  ],
  outputs: [
    {
      name: 'payee',
      type: 'address',
    },
  ],
} as const

export const getProviderPayee = async ({
  id,
  chain,
}: {
  id: bigint
  chain: FilecoinChain
}): Promise<Address> => {
  const provider = filProvider[chain.id]
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [id]),
        to: chain.contracts.providerRegistry.address,
      },
      'latest',
    ],
  })

  return checksum(decodeResult(abi, result))
}
