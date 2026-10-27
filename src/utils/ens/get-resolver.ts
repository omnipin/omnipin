import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type Address, checksum } from 'ox/Address'
import { toHex } from 'ox/Bytes'
import type { Hex } from 'ox/Hex'
import type { Provider } from 'ox/Provider'
import { ZERO_ADDRESS } from '../address.js'
import { SIMULATION_GAS_LIMIT } from '../tx.js'
import { packetToBytes } from './utils.js'

export const abi = {
  type: 'function',
  name: 'findResolver',
  inputs: [
    {
      name: 'name',
      type: 'bytes',
      internalType: 'bytes',
    },
  ],
  outputs: [
    {
      name: '',
      type: 'address',
      internalType: 'address',
    },
    {
      name: '',
      type: 'bytes32',
      internalType: 'bytes32',
    },
    {
      name: '',
      type: 'uint256',
      internalType: 'uint256',
    },
  ],
  stateMutability: 'view',
} as const
/** `ICompositeResolver` ERC-165 interface id. */
const COMPOSITE_RESOLVER_INTERFACE = '0xeea330f9' as const

const supportsInterfaceAbi = {
  type: 'function',
  name: 'supportsInterface',
  inputs: [{ name: 'interfaceId', type: 'bytes4' }],
  outputs: [{ name: '', type: 'bool' }],
  stateMutability: 'view',
} as const

const getResolverAbi = {
  type: 'function',
  name: 'getResolver',
  inputs: [{ name: 'name', type: 'bytes' }],
  outputs: [
    { name: 'resolver', type: 'address' },
    { name: 'offchain', type: 'bool' },
  ],
  stateMutability: 'view',
} as const

const ethCall = ({
  provider,
  to,
  data,
}: {
  provider: Provider
  to: Address
  data: Hex
}) =>
  provider.request({
    method: 'eth_call',
    params: [{ to, data, gas: SIMULATION_GAS_LIMIT }, 'latest'],
  })

const isCompositeResolver = async ({
  provider,
  resolver,
}: {
  provider: Provider
  resolver: Address
}): Promise<boolean> => {
  try {
    const result = await ethCall({
      provider,
      to: resolver,
      data: encodeData(supportsInterfaceAbi, [COMPOSITE_RESOLVER_INTERFACE]),
    })
    return decodeResult(supportsInterfaceAbi, result)
  } catch {
    // Legacy resolvers without ERC-165 revert on the call.
    return false
  }
}

// Bounds the unwrapping in case composite resolvers point at each other.
const MAX_COMPOSITE_DEPTH = 4

/**
 * Finds the resolver that holds the records of `name`, i.e. the contract
 * record updates have to be sent to.
 *
 * With ENSv2 live, the Universal Resolver returns a composite resolver for
 * names that are not in ENSv2 (e.g. the `ENSV1Resolver` mirror for ENSv1
 * names). Composite resolvers only forward reads, so they are unwrapped with
 * `ICompositeResolver.getResolver` to the resolver that stores the records.
 */
export const getEnsResolver = async ({
  provider,
  name,
}: {
  provider: Provider
  name: string
}): Promise<Address> => {
  const dnsName = toHex(packetToBytes(name))

  const result = await ethCall({
    provider,
    to: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe',
    data: encodeData(abi, [dnsName]),
  })

  let [resolver] = decodeResult(abi, result)

  for (let depth = 0; depth < MAX_COMPOSITE_DEPTH; depth++) {
    if (resolver === ZERO_ADDRESS) break
    if (!(await isCompositeResolver({ provider, resolver }))) break

    const [underlying, offchain] = decodeResult(
      getResolverAbi,
      await ethCall({
        provider,
        to: resolver,
        data: encodeData(getResolverAbi, [dnsName]),
      }),
    )
    if (offchain)
      throw new Error(
        `${name} resolves offchain through ${checksum(resolver)}; its records cannot be updated onchain`,
      )
    resolver = underlying
  }

  return checksum(resolver)
}
