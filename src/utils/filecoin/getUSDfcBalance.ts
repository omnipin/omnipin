import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { filecoinCalibration, filProvider } from './constants.js'

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

export const getUSDfcBalance = async (address: Address) => {
  const result = await filProvider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [address]),
        to: filecoinCalibration.contracts.usdfc.address,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
