import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { filecoinCalibration, filProvider } from './constants.js'

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

export const getProviderIdByAddress = async (
  providerAddress: Address,
): Promise<bigint> => {
  const result = await filProvider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [providerAddress]),
        to: filecoinCalibration.contracts.proxy.address,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
