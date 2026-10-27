import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { fromString, toHex } from 'ox/Bytes'
import { namehash, normalize } from 'ox/Ens'
import { keccak256 } from 'ox/Hash'
import type { Hex } from 'ox/Hex'
import type { Provider } from 'ox/Provider'
import type { ChainName } from '../../types.js'
import { SIMULATION_GAS_LIMIT } from '../tx.js'
import { packetToBytes } from './utils.js'

/**
 * ENSv2 `PermissionedResolver` roles. The deployed resolver is the pre-EAC
 * revision where `setContenthash` is authorized on the ROOT resource, so the
 * role is granted with `grantRootRoles` (or at initialization time).
 */
export const ROLE_SET_CONTENTHASH = 1n << 8n
export const ROLE_SET_CONTENTHASH_ADMIN = ROLE_SET_CONTENTHASH << 128n

/** Every regular and admin role in the EnhancedAccessControl bitmap. */
export const ALL_ROLES = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

/** `IPermissionedResolver` ERC-165 interface id. */
export const PERMISSIONED_RESOLVER_INTERFACE = '0x8c2427cc' as const

/** `setContenthash(bytes,bytes)` — the ENSv2 permissioned resolver setter. */
export const SET_CONTENTHASH_V2_SELECTOR = '0xc5d7badd' as const

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export const ensv2Addresses = {
  mainnet: {
    factory: '0x77510ba162dfeA3d8989E3f0928a691B345730D2',
    resolverImplementation: '0x565b0F456a04Ac9b48758190e90030623Cff57C5',
    registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    nameWrapper: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401',
  },
  sepolia: {
    factory: '0xDa70306C98E97eCe36F997a21368e53298572991',
    resolverImplementation: '0x115eb53F0c60696633855F90b138178Fb40b2b2C',
    registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    nameWrapper: '0x0635513f179D50A207757E05759CbD106d7dFcE8',
  },
} as const satisfies Record<
  ChainName,
  {
    factory: Address
    resolverImplementation: Address
    registry: Address
    nameWrapper: Address
  }
>

/** Universal Resolver proxy, shared by every supported chain. */
export const UNIVERSAL_RESOLVER =
  '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe' as const

const supportsInterfaceAbi = {
  type: 'function',
  name: 'supportsInterface',
  stateMutability: 'view',
  inputs: [{ name: 'interfaceId', type: 'bytes4' }],
  outputs: [{ name: '', type: 'bool' }],
} as const

const isEnsV2Selector = '0x1a6cc9f0' as const
const rootRegistrySelector = '0xc92cc49a' as const

const isEnsV2Abi = {
  type: 'function',
  name: 'isENSv2',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ name: '', type: 'bool' }],
} as const

const rootRegistryAbi = {
  type: 'function',
  name: 'ROOT_REGISTRY',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ name: '', type: 'address' }],
} as const

const getSubregistryAbi = {
  type: 'function',
  name: 'getSubregistry',
  stateMutability: 'view',
  inputs: [{ name: 'label', type: 'string' }],
  outputs: [{ name: '', type: 'address' }],
} as const

const predictProxyAddressAbi = {
  type: 'function',
  name: 'predictProxyAddress',
  stateMutability: 'view',
  inputs: [
    { name: 'deployer', type: 'address' },
    { name: 'salt', type: 'uint256' },
  ],
  outputs: [{ name: 'proxy', type: 'address' }],
} as const

const registrySetResolverAbi = {
  type: 'function',
  name: 'setResolver',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'anyId', type: 'uint256' },
    { name: 'resolver', type: 'address' },
  ],
  outputs: [],
} as const

const registrySetResolverV1Abi = {
  type: 'function',
  name: 'setResolver',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'node', type: 'bytes32' },
    { name: 'resolver', type: 'address' },
  ],
  outputs: [],
} as const

const registryOwnerAbi = {
  type: 'function',
  name: 'owner',
  stateMutability: 'view',
  inputs: [{ name: 'node', type: 'bytes32' }],
  outputs: [{ name: '', type: 'address' }],
} as const

const nameWrapperSetResolverAbi = {
  type: 'function',
  name: 'setResolver',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'node', type: 'bytes32' },
    { name: 'resolver', type: 'address' },
  ],
  outputs: [],
} as const

const hasRootRolesAbi = {
  type: 'function',
  name: 'hasRootRoles',
  stateMutability: 'view',
  inputs: [
    { name: 'roleBitmap', type: 'uint256' },
    { name: 'account', type: 'address' },
  ],
  outputs: [{ name: '', type: 'bool' }],
} as const

const grantRootRolesAbi = {
  type: 'function',
  name: 'grantRootRoles',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'roleBitmap', type: 'uint256' },
    { name: 'account', type: 'address' },
  ],
  outputs: [{ name: '', type: 'bool' }],
} as const

const deployProxyAbi = {
  type: 'function',
  name: 'deployProxy',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'implementation', type: 'address' },
    { name: 'salt', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ],
  outputs: [{ name: 'proxy', type: 'address' }],
} as const

const initializeAbi = {
  type: 'function',
  name: 'initialize',
  stateMutability: 'nonpayable',
  inputs: [
    {
      name: 'grants',
      type: 'tuple[]',
      components: [
        { name: 'account', type: 'address' },
        { name: 'roleBitmap', type: 'uint256' },
      ],
    },
    { name: 'calls', type: 'bytes[]' },
  ],
  outputs: [],
} as const

/** `setContenthash(bytes name, bytes hash)` used by ENSv2 resolvers. */
export const setContentHashV2 = {
  name: 'setContenthash',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { type: 'bytes', name: 'name' },
    { type: 'bytes', name: 'hash' },
  ],
  outputs: [],
} as const

const ethCall = async ({
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

const supportsInterface = async ({
  provider,
  address,
  interfaceId,
}: {
  provider: Provider
  address: Address
  interfaceId: Hex
}): Promise<boolean> => {
  try {
    const result = await ethCall({
      provider,
      to: address,
      data: encodeData(supportsInterfaceAbi, [interfaceId]),
    })
    return decodeResult(supportsInterfaceAbi, result as Hex)
  } catch {
    // Legacy resolvers without ERC-165 revert on the call.
    return false
  }
}

/** True when `address` is an ENSv2 `PermissionedResolver`. */
export const isPermissionedResolver = ({
  provider,
  address,
}: {
  provider: Provider
  address: Address
}) =>
  supportsInterface({
    provider,
    address,
    interfaceId: PERMISSIONED_RESOLVER_INTERFACE,
  })

/**
 * True when the resolver accepts the ENSv2 `setContenthash(bytes,bytes)`
 * signature. Broader than `isPermissionedResolver`, because a non-permissioned
 * ENSv2 resolver still uses the DNS-encoded setter.
 */
export const supportsV2Contenthash = ({
  provider,
  address,
}: {
  provider: Provider
  address: Address
}) =>
  supportsInterface({
    provider,
    address,
    interfaceId: SET_CONTENTHASH_V2_SELECTOR,
  })

export const isEnsV2Active = async ({
  provider,
}: {
  provider: Provider
}): Promise<boolean> => {
  try {
    const result = await ethCall({
      provider,
      to: UNIVERSAL_RESOLVER,
      data: isEnsV2Selector,
    })
    return decodeResult(isEnsV2Abi, result as Hex)
  } catch {
    return false
  }
}

export const hasRootRoles = async ({
  provider,
  resolver,
  roleBitmap,
  account,
}: {
  provider: Provider
  resolver: Address
  roleBitmap: bigint
  account: Address
}): Promise<boolean> => {
  const result = await ethCall({
    provider,
    to: resolver,
    data: encodeData(hasRootRolesAbi, [roleBitmap, account]),
  })
  return decodeResult(hasRootRolesAbi, result as Hex)
}

export const grantRootRolesData = (account: Address): Hex =>
  encodeData(grantRootRolesAbi, [ROLE_SET_CONTENTHASH, account])

export const initializeData = ({
  admin,
  roleAddress,
}: {
  admin: Address
  roleAddress: Address
}): Hex => {
  const grants: { account: Address; roleBitmap: bigint }[] = [
    { account: admin, roleBitmap: ALL_ROLES },
  ]

  if (admin.toLowerCase() !== roleAddress.toLowerCase())
    grants.push({ account: roleAddress, roleBitmap: ROLE_SET_CONTENTHASH })

  return encodeData(initializeAbi, [grants, []])
}

export const deployProxyData = ({
  chainName,
  salt,
  admin,
  roleAddress,
}: {
  chainName: ChainName
  salt: bigint
  admin: Address
  roleAddress: Address
}): Hex =>
  encodeData(deployProxyAbi, [
    ensv2Addresses[chainName].resolverImplementation,
    salt,
    initializeData({ admin, roleAddress }),
  ])

/** Predicts the CREATE2 address of the resolver deployed by `deployer`. */
export const computeResolverAddress = async ({
  provider,
  chainName,
  deployer,
  salt,
}: {
  provider: Provider
  chainName: ChainName
  deployer: Address
  salt: bigint
}): Promise<Address> => {
  const result = await ethCall({
    provider,
    to: ensv2Addresses[chainName].factory,
    data: encodeData(predictProxyAddressAbi, [deployer, salt]),
  })
  return decodeResult(predictProxyAddressAbi, result as Hex)
}

export const getCode = async ({
  provider,
  address,
}: {
  provider: Provider
  address: Address
}): Promise<Hex> =>
  provider.request({
    method: 'eth_getCode',
    params: [address, 'latest'],
  }) as Promise<Hex>

export const hasCode = async ({
  provider,
  address,
}: {
  provider: Provider
  address: Address
}) => {
  const code = await getCode({ provider, address })
  return Boolean(code) && code !== '0x'
}

/** `setResolver` calldata for a name, routed to the ENSv2 or ENSv1 registry. */
export const prepareSetResolverTx = async ({
  provider,
  chainName,
  name,
  resolver,
}: {
  provider: Provider
  chainName: ChainName
  name: string
  resolver: Address
}): Promise<{ to: Address; data: Hex }> => {
  if (await isEnsV2Active({ provider })) {
    try {
      const labels = normalize(name).split('.')
      const result = await ethCall({
        provider,
        to: UNIVERSAL_RESOLVER,
        data: rootRegistrySelector,
      })
      let registry = decodeResult(rootRegistryAbi, result as Hex) as Address

      for (const label of labels.slice(1).reverse()) {
        const subResult = await ethCall({
          provider,
          to: registry,
          data: encodeData(getSubregistryAbi, [label]),
        })
        registry = decodeResult(getSubregistryAbi, subResult as Hex) as Address
        if (registry === ZERO_ADDRESS)
          throw new Error(`No ENSv2 subregistry for ${label}`)
      }

      return {
        to: registry,
        data: encodeData(registrySetResolverAbi, [
          BigInt(labelhashLabel(labels[0])),
          resolver,
        ]),
      }
    } catch {
      // A reserved-but-unmigrated name still lives in the ENSv1 registry.
    }
  }

  const { registry, nameWrapper } = ensv2Addresses[chainName]
  const node = namehash(normalize(name))
  const result = await ethCall({
    provider,
    to: registry,
    data: encodeData(registryOwnerAbi, [node]),
  })
  const owner = decodeResult(registryOwnerAbi, result as Hex) as Address

  if (owner.toLowerCase() === nameWrapper.toLowerCase())
    return {
      to: nameWrapper,
      data: encodeData(nameWrapperSetResolverAbi, [node, resolver]),
    }

  return {
    to: registry,
    data: encodeData(registrySetResolverV1Abi, [node, resolver]),
  }
}

const labelhashLabel = (label: string): Hex =>
  keccak256(fromString(label), { as: 'Hex' })

/** DNS-encoded name as expected by ENSv2 permissioned resolvers. */
export const dnsEncodeName = (name: string): Hex =>
  toHex(packetToBytes(normalize(name)))
