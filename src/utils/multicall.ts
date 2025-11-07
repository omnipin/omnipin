import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import type { Provider } from 'ox/Provider'
import type { FilecoinChain } from './filecoin/constants.js'

const abi = {
  inputs: [
    {
      components: [
        {
          internalType: 'address',
          name: 'target',
          type: 'address',
        },
        {
          internalType: 'bytes',
          name: 'callData',
          type: 'bytes',
        },
      ],
      internalType: 'struct Multicall3.Call[]',
      name: 'calls',
      type: 'tuple[]',
    },
  ],
  name: 'aggregate',
  outputs: [
    {
      internalType: 'uint256',
      name: 'blockNumber',
      type: 'uint256',
    },
    {
      internalType: 'bytes[]',
      name: 'returnData',
      type: 'bytes[]',
    },
  ],
  stateMutability: 'payable',
  type: 'function',
} as const

export const multicall = async ({
  calls,
  provider,
  chain,
}: {
  calls: readonly { callData: Hex; target: Address }[]
  provider: Provider
  chain: FilecoinChain
}) => {
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [calls]),
        to: chain.contracts.multicall3.address,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)[1]
}
