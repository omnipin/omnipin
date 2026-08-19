import { describe, expect, it } from 'bun:test'
import type { Provider } from 'ox/Provider'
import { execTransactionWithRole } from '../../../src/utils/zodiac-roles/exec.js'

const ROLES_MOD = '0x1111111111111111111111111111111111111111'
const RESOLVER = '0x2222222222222222222222222222222222222222'
const FROM = '0x3333333333333333333333333333333333333333'
const DUMMY_PK =
  '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'

const ABI_FALSE = `0x${'0'.repeat(64)}` as const

/** Minimal provider that answers `eth_call` and records every method seen. */
const stubProvider = (callResult: string) => {
  const methods: string[] = []
  const provider = {
    request: async ({ method }: { method: string }) => {
      methods.push(method)
      if (method === 'eth_call') return callResult
      throw new Error(`unexpected RPC call: ${method}`)
    },
  } as unknown as Provider
  return { provider, methods }
}

describe('zodiac-roles/execTransactionWithRole', () => {
  // Regression: `simulateTransaction` resolves with the raw eth_call return
  // data, so `if (success)` was truthy even for an ABI-encoded `false` — the
  // guard never fired and a doomed transaction was signed and sent.
  it('throws when the module simulation returns false', async () => {
    const { provider, methods } = stubProvider(ABI_FALSE)

    await expect(
      execTransactionWithRole({
        provider,
        resolverAddress: RESOLVER,
        data: '0x',
        rolesModAddress: ROLES_MOD,
        from: FROM,
        privateKey: DUMMY_PK,
        chainId: 1,
        explorerUrl: 'https://etherscan.io',
      }),
    ).rejects.toThrow(/refused the setContenthash call/)

    // Nothing may be signed or broadcast once the simulation says no.
    expect(methods).toEqual(['eth_call'])
  })
})
