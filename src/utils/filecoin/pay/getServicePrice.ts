import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type FilecoinChain, filProvider } from '../constants.js'

const abi = {
  type: 'function',
  inputs: [],
  name: 'getServicePrice',
  outputs: [
    {
      name: 'pricing',
      internalType: 'struct FilecoinWarmStorageService.ServicePricing',
      type: 'tuple',
      components: [
        {
          name: 'pricePerTiBPerMonthNoCDN',
          internalType: 'uint256',
          type: 'uint256',
        },
        {
          name: 'pricePerTiBCdnEgress',
          internalType: 'uint256',
          type: 'uint256',
        },
        {
          name: 'pricePerTiBCacheMissEgress',
          internalType: 'uint256',
          type: 'uint256',
        },
        {
          name: 'tokenAddress',
          internalType: 'contract IERC20',
          type: 'address',
        },
        { name: 'epochsPerMonth', internalType: 'uint256', type: 'uint256' },
        {
          name: 'minimumPricePerMonth',
          internalType: 'uint256',
          type: 'uint256',
        },
      ],
    },
  ],
  stateMutability: 'view',
} as const

const TiB = 1024n ** 4n

export const getServicePrice = async ({
  chain,
  size: sizeInBytes,
}: {
  chain: FilecoinChain
  size: number
}) => {
  const provider = filProvider[chain.id]

  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        to: chain.contracts.storage.address,
        data: encodeData(abi),
      },
      'latest',
    ],
  })

  const { minimumPricePerMonth, pricePerTiBPerMonthNoCDN, epochsPerMonth } =
    decodeResult(abi, result)

  const linearCost = (BigInt(sizeInBytes) * pricePerTiBPerMonthNoCDN) / TiB
  const actualCost =
    linearCost > minimumPricePerMonth ? linearCost : minimumPricePerMonth
  const costWithBuffer = (actualCost * 110n) / 100n // apply 10% buffer for safety
  const perEpochRate = costWithBuffer / epochsPerMonth

  return {
    perMonth: costWithBuffer,
    perEpoch: perEpochRate,
    minimumFloor: minimumPricePerMonth,
    linearCost, // for debugging/comparison
  }
}
