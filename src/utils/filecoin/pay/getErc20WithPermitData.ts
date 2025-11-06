import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { multicall } from '../../multicall.js'
import { type FilecoinChain, filProvider } from '../constants.js'

const erc20Abi = [
  {
    constant: true,
    inputs: [
      {
        name: '_owner',
        type: 'address',
      },
    ],
    name: 'balanceOf',
    outputs: [
      {
        name: 'balance',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'nonces',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'version',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export const getErc20WithPermitData = async ({
  address,
  chain,
}: {
  address: Address
  chain: FilecoinChain
}) => {
  const target = chain.contracts.usdfc.address

  const results = await multicall({
    provider: filProvider[chain.id],
    calls: [
      encodeData(erc20Abi[0], [address]),
      encodeData(erc20Abi[1]),
      encodeData(erc20Abi[2], [address]),
      encodeData(erc20Abi[3]),
    ].map((callData) => ({ target, callData })),
  })

  const data: [bigint, string, bigint, string] = [0n, '', 0n, '']

  for (let i = 0; i < results.length; i++) {
    data[i] = decodeResult(erc20Abi[i], results[i])
  }

  return data
}
