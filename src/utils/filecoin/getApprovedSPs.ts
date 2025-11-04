import { decodeResult, encodeData } from 'ox/AbiFunction'
import { FWSS_REGISTRY_VIEW_ADDRESS, filProvider } from './constants.js'

const abi = [
  {
    inputs: [],
    name: 'getApprovedProvidersLength',
    outputs: [{ internalType: 'uint256', name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'offset', type: 'uint256' },
      { internalType: 'uint256', name: 'limit', type: 'uint256' },
    ],
    name: 'getApprovedProviders',
    outputs: [
      { internalType: 'uint256[]', name: 'providerIds', type: 'uint256[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const getApprovedSPs = async () => {
  // 1) Get total count
  const lenData = encodeData(abi[0])
  const lenResult = await filProvider.request({
    method: 'eth_call',
    params: [
      {
        data: lenData,
        to: FWSS_REGISTRY_VIEW_ADDRESS,
      },
      'latest',
    ],
  })
  const count = decodeResult(abi[0], lenResult)

  // 2) Fetch providerIds (offset=0, limit=count)
  const listData = encodeData(abi[1], [0n, count])
  const listResult = await filProvider.request({
    method: 'eth_call',
    params: [
      {
        data: listData,
        to: FWSS_REGISTRY_VIEW_ADDRESS,
      },
      'latest',
    ],
  })

  const providerIds = decodeResult(abi[1], listResult)

  return providerIds
}
