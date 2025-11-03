import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type Address, checksum } from 'ox/Address'
import { FWSS_PROXY_ADDRESS, filProvider } from './constants.js'

const abi = {
  type: 'function',
  name: 'getProviderPayee',
  stateMutability: 'view',
  inputs: [
    {
      name: 'providerId',
      type: 'uint256',
    },
  ],
  outputs: [
    {
      name: 'payee',
      type: 'address',
    },
  ],
} as const

export const getProviderPayee = async (id: bigint): Promise<Address> => {
  const result = await filProvider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [id]),
        to: FWSS_PROXY_ADDRESS,
      },
      'latest',
    ],
  })

  return checksum(decodeResult(abi, result))
}
