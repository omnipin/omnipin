import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { type FilecoinChain, filProvider } from '../constants.js'

const abi = {
  type: 'function',
  inputs: [
    { name: 'token', internalType: 'contract IERC20', type: 'address' },
    { name: 'owner', internalType: 'address', type: 'address' },
  ],
  name: 'accounts',
  outputs: [
    { name: 'funds', internalType: 'uint256', type: 'uint256' },
    { name: 'lockupCurrent', internalType: 'uint256', type: 'uint256' },
    { name: 'lockupRate', internalType: 'uint256', type: 'uint256' },
    { name: 'lockupLastSettledAt', internalType: 'uint256', type: 'uint256' },
  ],
  stateMutability: 'view',
} as const

export const getAccountInfo = async ({
  address,
  chain,
}: {
  address: Address
  chain: FilecoinChain
}) => {
  const provider = filProvider[chain.id]
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [chain.contracts.usdfc.address, address]),
        to: chain.contracts.payments.address,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
