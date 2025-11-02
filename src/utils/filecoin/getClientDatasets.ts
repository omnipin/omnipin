import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { FILECOIN_REGISTRY_ADDRESS, filProvider } from './constants.js'

const abi = {
  inputs: [
    {
      internalType: 'address',
      name: 'payer',
      type: 'address',
    },
  ],
  name: 'clientDataSets',
  outputs: [
    {
      internalType: 'uint256[]',
      name: 'dataSetIds',
      type: 'uint256[]',
    },
  ],
  stateMutability: 'view',
  type: 'function',
} as const

/**
 * List all known data sets for an address
 * @param address client address
 * @returns
 */
export const getClientDataSets = async (address: Address) => {
  const data = encodeData(abi, [address])

  const result = await filProvider.request({
    method: 'eth_call',
    params: [
      {
        data,
        to: FILECOIN_REGISTRY_ADDRESS,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
