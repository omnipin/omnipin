import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { type FilecoinChain, filProvider } from './constants.js'

const abi = {
  constant: true,
  inputs: [
    {
      name: 'account',
      type: 'address',
    },
  ],
  name: 'balanceOf',
  outputs: [
    {
      name: '',
      type: 'uint256',
    },
  ],
  payable: false,
  stateMutability: 'view',
  type: 'function',
} as const

export const getUSDfcBalance = async ({
  address,
  chain,
}: {
  address: Address
  chain: FilecoinChain
}): Promise<bigint> => {
  const provider = filProvider[chain.id]
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [address]),
        to: chain.contracts.usdfc.address,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
