import { describe, it } from 'bun:test'
import assert from 'node:assert'
import { encodeResult } from 'ox/AbiFunction'
import { checksum, type Address } from 'ox/Address'
import type { Provider } from 'ox/Provider'
import {
  abi as findResolverAbi,
  getEnsResolver,
} from '../../src/utils/ens/get-resolver.js'
import {
  abi as universalResolverResolveAbi,
  resolveEnsName,
} from '../../src/utils/ens/resolve-name.js'
import { OperationType } from '../../src/utils/safe/types.js'
import { prepareSafeTransactionData } from '../../src/utils/safe.js'
import { SIMULATION_GAS_LIMIT } from '../../src/utils/tx.js'

describe('Helios-compatible eth_call gas limit', () => {
  it('uses a Helios-compatible simulation gas cap', () => {
    assert.equal(SIMULATION_GAS_LIMIT, '0x1000000')
  })

  it('adds gas ceiling to getEnsResolver()', async () => {
    let call: Record<string, unknown> | undefined
    const resolvedAddress =
      '0x1111111111111111111111111111111111111111' as Address

    const provider = {
      request: async ({
        method,
        params,
      }: {
        method: string
        params: unknown[]
      }) => {
        assert.equal(method, 'eth_call')
        call = params[0] as Record<string, unknown>

        return encodeResult(findResolverAbi, [
          resolvedAddress,
          `0x${'00'.repeat(32)}`,
          0n,
        ])
      },
    } as unknown as Provider

    const address = await getEnsResolver({ provider, name: 'omnipin.eth' })

    assert.equal(call?.gas, SIMULATION_GAS_LIMIT)
    assert.equal(address, checksum(resolvedAddress))
  })

  it('adds gas ceiling to resolveEnsName()', async () => {
    let call: Record<string, unknown> | undefined
    const targetAddress = '0x2222222222222222222222222222222222222222'
    const encodedAddressRecord =
      `0x${'00'.repeat(12)}${targetAddress.slice(2)}` as `0x${string}`

    const provider = {
      request: async ({
        method,
        params,
      }: {
        method: string
        params: unknown[]
      }) => {
        assert.equal(method, 'eth_call')
        call = params[0] as Record<string, unknown>

        return encodeResult(universalResolverResolveAbi, [
          encodedAddressRecord,
          '0x3333333333333333333333333333333333333333' as Address,
        ])
      },
    } as unknown as Provider

    const address = await resolveEnsName({ provider, name: 'safe.omnipin.eth' })

    assert.equal(call?.gas, SIMULATION_GAS_LIMIT)
    assert.equal(address, targetAddress)
  })

  it('adds gas ceiling to prepareSafeTransactionData()', async () => {
    let call: Record<string, unknown> | undefined
    const safeTxHash = `0x${'ab'.repeat(32)}` as `0x${string}`

    const provider = {
      request: async ({
        method,
        params,
      }: {
        method: string
        params: unknown[]
      }) => {
        assert.equal(method, 'eth_call')
        call = params[0] as Record<string, unknown>
        return safeTxHash
      },
    } as unknown as Provider

    const result = await prepareSafeTransactionData({
      provider,
      chainId: 1,
      safeAddress: '0x0000000000000000000000000000000000000004',
      txData: {
        nonce: 1n,
        operation: OperationType.Call,
        to: '0x0000000000000000000000000000000000000005',
        data: '0x',
        value: 0n,
      },
    })

    assert.equal(call?.gas, SIMULATION_GAS_LIMIT)
    assert.equal(result.safeTxHash, safeTxHash)
  })
})
