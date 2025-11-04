import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import {
  FILECOIN_PAY_ADDRESS,
  filProvider,
  USDFC_ADDRESS,
} from '../constants.js'

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

export const getAccountInfo = async (address: Address) => {
  const result = await filProvider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [USDFC_ADDRESS, address]),
        to: FILECOIN_PAY_ADDRESS,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
