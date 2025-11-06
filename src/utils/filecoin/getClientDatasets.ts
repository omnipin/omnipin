import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { filecoinCalibration, filProvider } from './constants.js'

const abi = {
  type: 'function',
  name: 'getClientDataSets',
  inputs: [
    {
      name: 'client',
      type: 'address',
      internalType: 'address',
    },
  ],
  outputs: [
    {
      name: 'infos',
      type: 'tuple[]',
      internalType: 'struct FilecoinWarmStorageService.DataSetInfoView[]',
      components: [
        {
          name: 'pdpRailId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'cacheMissRailId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'cdnRailId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'payer',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'payee',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'serviceProvider',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'commissionBps',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'clientDataSetId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'pdpEndEpoch',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'providerId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'dataSetId',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
    },
  ],
  stateMutability: 'view',
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
        to: filecoinCalibration.contracts.registryView.address,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
