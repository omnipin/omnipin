import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type FilecoinChain, filProvider } from './constants.js'

const abi = {
  type: 'function',
  name: 'getRail',
  inputs: [{ name: 'railId', type: 'uint256', internalType: 'uint256' }],
  outputs: [
    {
      name: '',
      type: 'tuple',
      components: [
        { name: 'token', type: 'address', internalType: 'address' },
        { name: 'from', type: 'address', internalType: 'address' },
        { name: 'to', type: 'address', internalType: 'address' },
        { name: 'operator', type: 'address', internalType: 'address' },
        { name: 'validator', type: 'address', internalType: 'address' },
        { name: 'paymentRate', type: 'uint256', internalType: 'uint256' },
        { name: 'lockupPeriod', type: 'uint256', internalType: 'uint256' },
        { name: 'lockupFixed', type: 'uint256', internalType: 'uint256' },
        { name: 'settledUpTo', type: 'uint256', internalType: 'uint256' },
        { name: 'endEpoch', type: 'uint256', internalType: 'uint256' },
        { name: 'commissionRateBps', type: 'uint256', internalType: 'uint256' },
        {
          name: 'serviceFeeRecipient',
          type: 'address',
          internalType: 'address',
        },
      ],
    },
  ],
  stateMutability: 'view',
} as const

export type RailInfo = Awaited<ReturnType<typeof getRail>>

/**
 * Get rail info by ID
 * @returns Rail info including endEpoch - if > 0, rail is terminated
 */
export const getRail = async ({
  railId,
  chain,
}: {
  railId: bigint
  chain: FilecoinChain
}) => {
  const data = encodeData(abi, [railId])
  const provider = filProvider[chain.id]

  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data,
        to: chain.contracts.payments.address,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
