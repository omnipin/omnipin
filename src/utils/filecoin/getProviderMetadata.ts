import { decodeResult, encodeData } from 'ox/AbiFunction'
import * as Hex from 'ox/Hex'
import { type FilecoinChain, filProvider } from './constants.js'

const abi = {
  type: 'function',
  inputs: [
    { name: 'providerId', internalType: 'uint256', type: 'uint256' },
    {
      name: 'productType',
      internalType: 'enum ServiceProviderRegistryStorage.ProductType',
      type: 'uint8',
    },
  ],
  name: 'getProviderWithProduct',
  outputs: [
    {
      name: '',
      internalType: 'struct ServiceProviderRegistryStorage.ProviderWithProduct',
      type: 'tuple',
      components: [
        { name: 'providerId', internalType: 'uint256', type: 'uint256' },
        {
          name: 'providerInfo',
          internalType:
            'struct ServiceProviderRegistryStorage.ServiceProviderInfo',
          type: 'tuple',
          components: [
            {
              name: 'serviceProvider',
              internalType: 'address',
              type: 'address',
            },
            { name: 'payee', internalType: 'address', type: 'address' },
            { name: 'name', internalType: 'string', type: 'string' },
            { name: 'description', internalType: 'string', type: 'string' },
            { name: 'isActive', internalType: 'bool', type: 'bool' },
          ],
        },
        {
          name: 'product',
          internalType: 'struct ServiceProviderRegistryStorage.ServiceProduct',
          type: 'tuple',
          components: [
            {
              name: 'productType',
              internalType: 'enum ServiceProviderRegistryStorage.ProductType',
              type: 'uint8',
            },
            {
              name: 'capabilityKeys',
              internalType: 'string[]',
              type: 'string[]',
            },
            { name: 'isActive', internalType: 'bool', type: 'bool' },
          ],
        },
        {
          name: 'productCapabilityValues',
          internalType: 'bytes[]',
          type: 'bytes[]',
        },
      ],
    },
  ],
  stateMutability: 'view',
} as const

export const getProviderMetadata = async ({
  chain,
  providerId,
}: {
  chain: FilecoinChain
  providerId: bigint
}) => {
  const provider = filProvider[chain.id]
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        data: encodeData(abi, [providerId, 0]),
        to: chain.contracts.providerRegistry.address,
      },
      'latest',
    ],
  })

  const { providerInfo, productCapabilityValues, product } = decodeResult(
    abi,
    result,
  )
  const { capabilityKeys } = product
  const serviceURL = Hex.toString(
    productCapabilityValues[capabilityKeys.indexOf('serviceURL')],
  )

  return { address: providerInfo.payee, serviceURL }
}
