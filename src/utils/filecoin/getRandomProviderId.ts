import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type FilecoinChain, filProvider } from './constants.js'

const abi = {
  inputs: [
    {
      internalType: 'uint256',
      name: 'offset',
      type: 'uint256',
    },
    {
      internalType: 'uint256',
      name: 'limit',
      type: 'uint256',
    },
  ],
  name: 'getApprovedProviders',
  outputs: [
    {
      internalType: 'uint256[]',
      name: 'providerIds',
      type: 'uint256[]',
    },
  ],
  stateMutability: 'view',
  type: 'function',
} as const

export const getRandomProviderId = async ({
  chain,
}: {
  chain: FilecoinChain
}) => {
  const provider = filProvider[chain.id]
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [0n, 100n]),
        to: chain.contracts.storageView.address,
      },
      'latest',
    ],
  })

  const ids = decodeResult(abi, result)

  const randomIndex = Math.floor(Math.random() * ids.length)
  return ids[randomIndex]
}
