import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type Address, checksum } from 'ox/Address'
import { toHex } from 'ox/Bytes'
import { namehash, normalize } from 'ox/Ens'
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

const registryV1Abi = {
  type: 'function',
  name: 'REGISTRY_V1',
  inputs: [],
  outputs: [{ name: '', type: 'address' }],
  stateMutability: 'view',
} as const

const registryResolverAbi = {
  type: 'function',
  name: 'resolver',
  inputs: [{ name: 'node', type: 'bytes32' }],
  outputs: [{ name: '', type: 'address' }],
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

/**
 * Returns the ENSv1 registry when `resolver` is the ENSv2 `ENSV1Resolver`
 * mirror, which the Universal Resolver returns for names that have not migrated
 * to ENSv2. The mirror only forwards reads, so writes have to go to the
 * resolver set in the ENSv1 registry.
 */
const getMirroredRegistryV1 = async ({
  provider,
  resolver,
}: {
  provider: Provider
  resolver: Address
}): Promise<Address | undefined> => {
  try {
    const result = await ethCall({
      provider,
      to: resolver,
      data: encodeData(registryV1Abi),
    })
    return decodeResult(registryV1Abi, result)
  } catch {
    return undefined
  }
}

/**
 * Finds the resolver that holds the records of `name`, i.e. the contract
 * record updates have to be sent to.
 */
export const getEnsResolver = async ({
  provider,
  name,
}: {
  provider: Provider
  name: string
}): Promise<Address> => {
  const result = await ethCall({
    provider,
    to: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe',
    data: encodeData(abi, [toHex(packetToBytes(name))]),
  })

  const [resolverAddress] = decodeResult(abi, result)

  const registryV1 = await getMirroredRegistryV1({
    provider,
    resolver: resolverAddress,
  })
  if (!registryV1) return checksum(resolverAddress)

  // Walk up the ENSv1 registry like the ENSv1 Universal Resolver did, so a name
  // without its own resolver falls back to its parent's.
  const labels = normalize(name).split('.')
  for (let i = 0; i < labels.length; i++) {
    const resolver = decodeResult(
      registryResolverAbi,
      await ethCall({
        provider,
        to: registryV1,
        data: encodeData(registryResolverAbi, [
          namehash(labels.slice(i).join('.')),
        ]),
      }),
    )
    if (resolver !== ZERO_ADDRESS) return checksum(resolver)
  }

  return ZERO_ADDRESS
}
