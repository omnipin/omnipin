import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { decodeData, encodeData } from 'ox/AbiFunction'
import { type Address, checksum } from 'ox/Address'
import { namehash } from 'ox/Ens'
import type { Provider } from 'ox/Provider'
import { getEnsResolver } from '../../../src/utils/ens/get-resolver.js'
import {
  computeResolverAddress,
  deployProxyData,
  dnsEncodeName,
  grantRootRolesData,
  hasRootRoles,
  initializeData,
  isPermissionedResolver,
  prepareSetResolverTx,
  ROLE_SET_CONTENTHASH,
  setContentHashV2,
} from '../../../src/utils/ens/permissioned-resolver.js'

const ADMIN = checksum('0x1111111111111111111111111111111111111111')
const ROLE = checksum('0x2222222222222222222222222222222222222222')
const RESOLVER = checksum('0x3333333333333333333333333333333333333333')

const abiWordAddress = (address: Address) =>
  `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`

const abiWordBool = (value: boolean) =>
  `0x${'0'.repeat(63)}${value ? '1' : '0'}`

describe('permissioned resolver utils', () => {
  it('DNS-encodes names for the ENSv2 setter', () => {
    assert.equal(dnsEncodeName('omnipin.eth'), '0x076f6d6e6970696e0365746800')
  })

  it('encodes the permissioned setContenthash call', () => {
    const data = encodeData(setContentHashV2, [
      dnsEncodeName('omnipin.eth'),
      '0x1234',
    ])

    assert.ok(data.startsWith('0xc5d7badd'))
  })

  it('encodes grantRootRoles with the SET_CONTENTHASH bitmap', () => {
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

    const data = grantRootRolesData(ROLE)

    assert.ok(data.startsWith('0x072d5d77'))

    const [roleBitmap, account] = decodeData(
      grantRootRolesAbi,
      data,
    ) as unknown as readonly [bigint, Address]

    assert.equal(roleBitmap, ROLE_SET_CONTENTHASH)
    assert.equal(account, ROLE)
  })

  it('encodes deployProxy with the resolver implementation', () => {
    const data = deployProxyData({
      chainName: 'mainnet',
      salt: 1n,
      admin: ADMIN,
      roleAddress: ROLE,
    })

    assert.ok(data.startsWith('0x5d84121a'))
  })

  it('grants the role to a separate account at initialization', () => {
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

    const [grants] = decodeData(
      initializeAbi,
      initializeData({ admin: ADMIN, roleAddress: ROLE }),
    ) as unknown as [
      readonly { account: Address; roleBitmap: bigint }[],
      readonly string[],
    ]

    assert.equal(grants.length, 2)
    assert.equal(grants[0]?.account, ADMIN)
    assert.equal(grants[1]?.account, ROLE)
    assert.equal(grants[1]?.roleBitmap, ROLE_SET_CONTENTHASH)
  })

  it('does not duplicate the grant when admin and role are the same', () => {
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

    const [grants] = decodeData(
      initializeAbi,
      initializeData({ admin: ADMIN, roleAddress: ADMIN }),
    ) as unknown as [
      readonly { account: Address; roleBitmap: bigint }[],
      readonly string[],
    ]

    assert.equal(grants.length, 1)
  })

  it('detects a permissioned resolver by ERC-165', async () => {
    const provider = {
      request: async () => abiWordBool(true),
    } as unknown as Provider

    assert.equal(
      await isPermissionedResolver({ provider, address: RESOLVER }),
      true,
    )
  })

  it('treats a reverting resolver as non-permissioned', async () => {
    const provider = {
      request: async () => {
        throw new Error('execution reverted')
      },
    } as unknown as Provider

    assert.equal(
      await isPermissionedResolver({ provider, address: RESOLVER }),
      false,
    )
  })

  it('reads root roles', async () => {
    const provider = {
      request: async () => abiWordBool(true),
    } as unknown as Provider

    assert.equal(
      await hasRootRoles({
        provider,
        resolver: RESOLVER,
        roleBitmap: ROLE_SET_CONTENTHASH,
        account: ROLE,
      }),
      true,
    )
  })

  it('predicts the resolver address through the factory', async () => {
    const provider = {
      request: async () => abiWordAddress(RESOLVER),
    } as unknown as Provider

    assert.equal(
      await computeResolverAddress({
        provider,
        chainName: 'mainnet',
        deployer: ADMIN,
        salt: 1n,
      }),
      RESOLVER,
    )
  })

  describe('prepareSetResolverTx', () => {
    const rootRegistry = checksum('0x4444444444444444444444444444444444444444')
    const ethRegistry = checksum('0x5555555555555555555555555555555555555555')

    const ensV2Provider = (status: number) =>
      ({
        request: async ({
          params,
        }: {
          params: [{ data: string; to: string }, string]
        }) => {
          const [{ data, to }] = params

          if (data.startsWith('0x1a6cc9f0')) return abiWordBool(true)
          if (data.startsWith('0xc92cc49a')) return abiWordAddress(rootRegistry)
          if (to === rootRegistry && data.startsWith('0x35af6216'))
            return abiWordAddress(ethRegistry)
          if (to === ethRegistry && data.startsWith('0x5c622a0e'))
            return `0x${status.toString(16).padStart(64, '0')}`
          // ENSv1 registry `owner(bytes32)`
          if (data.startsWith('0x02571be3')) return abiWordAddress(ADMIN)

          throw new Error(`unexpected call ${to} ${data}`)
        },
      }) as unknown as Provider

    it('uses the ENSv1 registry for names reserved in ENSv2', async () => {
      const tx = await prepareSetResolverTx({
        provider: ensV2Provider(1),
        chainName: 'mainnet',
        name: 'omnipin.eth',
        resolver: RESOLVER,
      })

      assert.equal(
        tx.to,
        checksum('0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'),
      )
      assert.ok(tx.data.startsWith('0x1896f70a'))
    })

    it('uses the ENSv2 registry for names registered there', async () => {
      const provider = ensV2Provider(2)

      const tx = await prepareSetResolverTx({
        provider,
        chainName: 'mainnet',
        name: 'omnipin.eth',
        resolver: RESOLVER,
      })

      assert.equal(tx.to, ethRegistry)
      assert.ok(tx.data.startsWith('0xbc7b6d62'))
      assert.equal(
        tx.data,
        encodeData(
          {
            type: 'function',
            name: 'setResolver',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'anyId', type: 'uint256' },
              { name: 'resolver', type: 'address' },
            ],
            outputs: [],
          },
          [
            BigInt(
              `0x${'c5652e0eb9e7533379fed2f2f72c69f6350194ee53209d5de2d75982769902ce'}`,
            ),
            RESOLVER,
          ],
        ),
      )
    })

    it('uses the ENSv1 registry when ENSv2 is unavailable', async () => {
      const provider = {
        request: async ({ params }: { params: [{ data: string }, string] }) => {
          if (params[0].data.startsWith('0x1a6cc9f0'))
            throw new Error('execution reverted')

          return abiWordAddress(ADMIN)
        },
      } as unknown as Provider

      const tx = await prepareSetResolverTx({
        provider,
        chainName: 'mainnet',
        name: 'omnipin.eth',
        resolver: RESOLVER,
      })

      assert.ok(tx.data.startsWith('0x1896f70a'))
    })

    it('uses the NameWrapper for wrapped names', async () => {
      const provider = {
        request: async ({ params }: { params: [{ data: string }, string] }) => {
          if (params[0].data.startsWith('0x1a6cc9f0'))
            throw new Error('execution reverted')

          return abiWordAddress(
            checksum('0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401'),
          )
        },
      } as unknown as Provider

      const tx = await prepareSetResolverTx({
        provider,
        chainName: 'mainnet',
        name: 'omnipin.eth',
        resolver: RESOLVER,
      })

      assert.equal(
        tx.to,
        checksum('0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401'),
      )
      assert.ok(tx.data.startsWith('0x1896f70a'))
    })
  })

  describe('getEnsResolver', () => {
    const MIRROR = checksum('0x394D8EB4a4fDF599384DeAb25F31d111d755c398')
    const REGISTRY_V1 = checksum('0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e')
    const UNIVERSAL_RESOLVER = '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe'

    const findResolverResult = (resolver: Address) =>
      `${abiWordAddress(resolver)}${'0'.repeat(128)}`

    it('returns the Universal Resolver result for ENSv2 resolvers', async () => {
      const provider = {
        request: async ({
          params,
        }: {
          params: [{ data: string; to: string }, string]
        }) => {
          const [{ data, to }] = params
          if (to === UNIVERSAL_RESOLVER) return findResolverResult(RESOLVER)
          // `REGISTRY_V1()` is only implemented by the ENSv1 mirror
          if (data.startsWith('0xe370ecbe'))
            throw new Error('execution reverted')
          throw new Error(`unexpected call ${to} ${data}`)
        },
      } as unknown as Provider

      assert.equal(
        await getEnsResolver({ provider, name: 'omnipin.eth' }),
        RESOLVER,
      )
    })

    it('looks through the ENSv1 mirror to the ENSv1 registry', async () => {
      const calls: string[] = []
      const provider = {
        request: async ({
          params,
        }: {
          params: [{ data: string; to: string }, string]
        }) => {
          const [{ data }] = params
          const to = checksum(params[0].to)
          if (to === checksum(UNIVERSAL_RESOLVER))
            return findResolverResult(MIRROR)
          if (to === MIRROR && data.startsWith('0xe370ecbe'))
            return abiWordAddress(REGISTRY_V1)
          if (to === REGISTRY_V1 && data.startsWith('0x0178b8bf')) {
            calls.push(data.slice(10))
            // `sub.omnipin.eth` has no resolver, `omnipin.eth` has one
            return abiWordAddress(
              calls.length === 1
                ? checksum('0x0000000000000000000000000000000000000000')
                : RESOLVER,
            )
          }
          throw new Error(`unexpected call ${to} ${data}`)
        },
      } as unknown as Provider

      assert.equal(
        await getEnsResolver({ provider, name: 'sub.omnipin.eth' }),
        RESOLVER,
      )
      assert.deepEqual(calls, [
        namehash('sub.omnipin.eth').slice(2),
        namehash('omnipin.eth').slice(2),
      ])
    })
  })
})
