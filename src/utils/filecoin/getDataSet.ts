import { decodeResult, encodeData } from 'ox/AbiFunction'
import {
  FWSS_REGISTRY_VIEW_ADDRESS,
  filecoinCalibration,
  filProvider,
} from './constants.js'

const abi = {
  type: 'function',
  inputs: [{ name: 'dataSetId', internalType: 'uint256', type: 'uint256' }],
  name: 'getDataSet',
  outputs: [
    {
      name: 'info',
      internalType: 'struct FilecoinWarmStorageService.DataSetInfoView',
      type: 'tuple',
      components: [
        { name: 'pdpRailId', internalType: 'uint256', type: 'uint256' },
        { name: 'cacheMissRailId', internalType: 'uint256', type: 'uint256' },
        { name: 'cdnRailId', internalType: 'uint256', type: 'uint256' },
        { name: 'payer', internalType: 'address', type: 'address' },
        { name: 'payee', internalType: 'address', type: 'address' },
        { name: 'serviceProvider', internalType: 'address', type: 'address' },
        { name: 'commissionBps', internalType: 'uint256', type: 'uint256' },
        { name: 'clientDataSetId', internalType: 'uint256', type: 'uint256' },
        { name: 'pdpEndEpoch', internalType: 'uint256', type: 'uint256' },
        { name: 'providerId', internalType: 'uint256', type: 'uint256' },
        { name: 'dataSetId', internalType: 'uint256', type: 'uint256' },
      ],
    },
  ],
  stateMutability: 'view',
} as const

export const getDataSet = async (dataSetId: bigint) => {
  const result = await filProvider.request({
    method: 'eth_call',
    params: [
      { data: encodeData(abi, [dataSetId]), to: FWSS_REGISTRY_VIEW_ADDRESS },
      'latest',
    ],
  })

  return decodeResult(abi, result)
}
