import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'

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

const provider = Provider.from(
  fromHttp('https://api.calibration.node.glif.io/rpc/v1'),
)

const FILECOIN_REGISTRY_ADDRESS = '0x87ede87cef4bfefe0374c3470cb3f5be18b739d5'

/**
 * List all known datasets for an address
 * @param address client address
 * @returns
 */
export const getClientDatasets = async (address: Address) => {
  const data = encodeData(abi, [address])

  const result = await provider.request({
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
