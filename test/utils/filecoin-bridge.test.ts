import { describe, expect, it } from 'bun:test'
import type * as Provider from 'ox/Provider'
import {
  computeFwssFloor,
  ensureRouterAllowances,
  FILECOIN_USDFC,
  fetchSourceBalance,
  isSourceChainKey,
  PERMIT2_ADDRESS,
  resolveSourceToken,
  SOURCE_CHAINS,
} from '../../src/utils/filecoin-bridge.js'
import { NATIVE_TOKEN } from '../../src/utils/squid.js'

describe('filecoin-bridge utils', () => {
  describe('SOURCE_CHAINS', () => {
    it('contains the seven allow-listed chains', () => {
      expect(Object.keys(SOURCE_CHAINS).sort()).toEqual(
        ['arb', 'avax', 'base', 'bsc', 'eth', 'opt', 'polygon'].sort(),
      )
    })

    it('maps each chain to its canonical chain id', () => {
      expect(SOURCE_CHAINS.eth.id).toBe(1)
      expect(SOURCE_CHAINS.opt.id).toBe(10)
      expect(SOURCE_CHAINS.bsc.id).toBe(56)
      expect(SOURCE_CHAINS.polygon.id).toBe(137)
      expect(SOURCE_CHAINS.base.id).toBe(8453)
      expect(SOURCE_CHAINS.arb.id).toBe(42161)
      expect(SOURCE_CHAINS.avax.id).toBe(43114)
    })
  })

  describe('FILECOIN_USDFC', () => {
    it('is the canonical USDfc address on Filecoin', () => {
      expect(FILECOIN_USDFC.toLowerCase()).toBe(
        '0x80b98d3aa09ffff255c3ba4a241111ff1262f045',
      )
    })
  })

  describe('isSourceChainKey', () => {
    it('accepts every allow-listed chain', () => {
      for (const key of Object.keys(SOURCE_CHAINS)) {
        expect(isSourceChainKey(key)).toBe(true)
      }
    })

    it('rejects unknown chains', () => {
      expect(isSourceChainKey('fantom')).toBe(false)
      expect(isSourceChainKey('zksync')).toBe(false)
      expect(isSourceChainKey('eth ')).toBe(false)
      expect(isSourceChainKey(undefined)).toBe(false)
    })
  })

  describe('resolveSourceToken', () => {
    it('resolves a known symbol on the given chain', () => {
      expect(
        resolveSourceToken({ chain: 'arb', token: 'USDC' }).toLowerCase(),
      ).toBe('0xaf88d065e77c8cc2239327c5edb3a432268e5831')
    })

    it('resolves case-insensitively', () => {
      expect(
        resolveSourceToken({ chain: 'eth', token: 'usdc' }).toLowerCase(),
      ).toBe(SOURCE_CHAINS.eth.tokens.USDC.toLowerCase())
    })

    it('resolves a native gas token to the 0xeee sentinel', () => {
      expect(resolveSourceToken({ chain: 'eth', token: 'ETH' })).toBe(
        NATIVE_TOKEN,
      )
      expect(resolveSourceToken({ chain: 'bsc', token: 'BNB' })).toBe(
        NATIVE_TOKEN,
      )
      expect(resolveSourceToken({ chain: 'polygon', token: 'POL' })).toBe(
        NATIVE_TOKEN,
      )
    })

    it('resolves dotted symbols like USDC.e', () => {
      expect(
        resolveSourceToken({ chain: 'polygon', token: 'USDC.e' }).toLowerCase(),
      ).toBe('0x2791bca1f2de4661ed88a30c99a7a9449aa84174')
    })

    it('passes through raw 0x addresses', () => {
      const raw = '0x1234567890123456789012345678901234567890'
      expect(resolveSourceToken({ chain: 'eth', token: raw })).toBe(raw)
    })

    it('throws for unknown symbols', () => {
      expect(() =>
        resolveSourceToken({ chain: 'eth', token: 'FOOBAR' }),
      ).toThrow(/Unknown token/)
    })

    it('rejects malformed 0x addresses (wrong length) by treating as a symbol', () => {
      // Anything that starts with 0x but isn't 42 chars long is treated as a
      // symbol → unknown symbol → throws.
      expect(() =>
        resolveSourceToken({ chain: 'eth', token: '0xabc' }),
      ).toThrow(/Unknown token/)
    })
  })
})

describe('ensureRouterAllowances', () => {
  const TEST_PK = `0x${'11'.repeat(32)}` as const
  const OWNER = '0x972a34a8a7b9e19da849921f8d9d58f3d2df568b' as const
  // Squid's router target — the spender that pulls the source token, either
  // via a direct transferFrom or through Permit2.
  const SQUID_ROUTER = '0xce16F69375520ab01377ce7B88f5BA8C48F8D666' as const
  const USDC = SOURCE_CHAINS.eth.tokens.USDC

  // ERC-20 / Permit2 selectors.
  const ERC20_ALLOWANCE = '0xdd62ed3e' // allowance(address,address)
  const ERC20_APPROVE = '0x095ea7b3' // approve(address,uint256)
  const PERMIT2_APPROVE = '0x87517c45' // approve(address,address,uint160,uint48)

  /** Left-pad a value to a 32-byte ABI word (no 0x prefix). */
  const word = (v: bigint | number) => BigInt(v).toString(16).padStart(64, '0')
  /** Extract the trailing 20-byte address from a 32-byte word, lowercased. */
  const addrInWord = (w: string) => `0x${w.slice(24)}`.toLowerCase()

  /**
   * Build a mock provider that reports the given starting allowances and
   * records every read (`eth_call`) and every transaction (captured at the
   * `eth_estimateGas` step, which `sendTransaction` runs per tx).
   */
  const makeProvider = (state: {
    erc20Allowance: bigint
    permit2Amount: bigint
    permit2Expiration: number
  }) => {
    const sent: { to: string; data: string }[] = []
    const reads: { to: string; data: string }[] = []
    const request = async ({
      method,
      params,
    }: {
      method: string
      params?: readonly unknown[]
    }): Promise<unknown> => {
      switch (method) {
        case 'eth_call': {
          const call = (params?.[0] ?? {}) as { to: string; data: string }
          reads.push({ to: call.to, data: call.data })
          if (call.to.toLowerCase() === PERMIT2_ADDRESS.toLowerCase()) {
            // (uint160 amount, uint48 expiration, uint48 nonce)
            return `0x${word(state.permit2Amount)}${word(
              state.permit2Expiration,
            )}${word(0)}`
          }
          // ERC-20 allowance(owner, spender) → single uint256
          return `0x${word(state.erc20Allowance)}`
        }
        case 'eth_estimateGas': {
          const call = (params?.[0] ?? {}) as { to: string; data: string }
          sent.push({ to: call.to, data: call.data })
          return '0x5208'
        }
        case 'eth_getTransactionCount':
          return '0x0'
        case 'eth_getBlockByNumber':
          return { baseFeePerGas: '0x3b9aca00' }
        case 'eth_maxPriorityFeePerGas':
          return '0x1'
        case 'eth_sendRawTransaction':
          return `0x${'ab'.repeat(32)}`
        case 'eth_getTransactionReceipt':
          return { status: '0x1', logs: [], type: '0x2' }
        case 'eth_chainId':
          return '0x1'
        default:
          throw new Error(`unexpected RPC method ${method}`)
      }
    }
    return {
      provider: { request } as unknown as Provider.Provider,
      sent,
      reads,
    }
  }

  const run = (provider: Provider.Provider, amount = 100_000n) =>
    ensureRouterAllowances({
      provider,
      privateKey: TEST_PK,
      owner: OWNER,
      token: USDC,
      spender: SQUID_ROUTER,
      amount,
      chainId: SOURCE_CHAINS.eth.id,
    })

  it('approves the router directly, then sets up the Permit2 path', async () => {
    const { provider, sent, reads } = makeProvider({
      erc20Allowance: 0n,
      permit2Amount: 0n,
      permit2Expiration: 0,
    })

    await run(provider)

    // The ERC-20 allowance is checked against BOTH the router (direct
    // transferFrom path — the case that regressed Base→Filecoin) and Permit2.
    const erc20Reads = reads.filter(
      (r) =>
        r.to.toLowerCase() === USDC.toLowerCase() &&
        r.data.slice(0, 10) === ERC20_ALLOWANCE,
    )
    const erc20ReadSpenders = erc20Reads.map((r) =>
      addrInWord(r.data.slice(-64)),
    )
    expect(erc20ReadSpenders).toContain(SQUID_ROUTER.toLowerCase())
    expect(erc20ReadSpenders).toContain(PERMIT2_ADDRESS.toLowerCase())

    expect(sent).toHaveLength(3)
    const [approveRouter, approvePermit2Erc20, approvePermit2] = sent

    // 1) ERC-20 approve(router, maxUint256) — direct transferFrom path
    expect(approveRouter.to.toLowerCase()).toBe(USDC.toLowerCase())
    expect(approveRouter.data.slice(0, 10)).toBe(ERC20_APPROVE)
    expect(addrInWord(approveRouter.data.slice(10, 74))).toBe(
      SQUID_ROUTER.toLowerCase(),
    )
    expect(approveRouter.data.slice(74, 138)).toBe('f'.repeat(64))

    // 2) ERC-20 approve(PERMIT2, maxUint256)
    expect(approvePermit2Erc20.to.toLowerCase()).toBe(USDC.toLowerCase())
    expect(approvePermit2Erc20.data.slice(0, 10)).toBe(ERC20_APPROVE)
    expect(addrInWord(approvePermit2Erc20.data.slice(10, 74))).toBe(
      PERMIT2_ADDRESS.toLowerCase(),
    )
    expect(approvePermit2Erc20.data.slice(74, 138)).toBe('f'.repeat(64))

    // 3) Permit2 approve(token, router, maxUint160, maxUint48)
    expect(approvePermit2.to.toLowerCase()).toBe(PERMIT2_ADDRESS.toLowerCase())
    expect(approvePermit2.data.slice(0, 10)).toBe(PERMIT2_APPROVE)
    expect(addrInWord(approvePermit2.data.slice(10, 74))).toBe(
      USDC.toLowerCase(),
    )
    expect(addrInWord(approvePermit2.data.slice(74, 138))).toBe(
      SQUID_ROUTER.toLowerCase(),
    )
    // amount = max uint160, expiration = max uint48
    expect(approvePermit2.data.slice(138, 202)).toBe(
      `${'0'.repeat(24)}${'f'.repeat(40)}`,
    )
    expect(approvePermit2.data.slice(202, 266)).toBe(
      `${'0'.repeat(52)}${'f'.repeat(12)}`,
    )
  })

  it('issues no transactions when both allowances already cover the amount', async () => {
    const { provider, sent } = makeProvider({
      erc20Allowance: 2n ** 256n - 1n,
      permit2Amount: 2n ** 160n - 1n,
      permit2Expiration: Math.floor(Date.now() / 1000) + 86_400,
    })

    await run(provider)

    expect(sent).toHaveLength(0)
  })

  it('re-authorizes via Permit2 when the stored allowance is expired', async () => {
    const { provider, sent } = makeProvider({
      erc20Allowance: 2n ** 256n - 1n, // ERC-20 → Permit2 already in place
      permit2Amount: 2n ** 160n - 1n, // amount is sufficient…
      permit2Expiration: 1, // …but expired (this is the AllowanceExpired case)
    })

    await run(provider)

    expect(sent).toHaveLength(1)
    expect(sent[0].to.toLowerCase()).toBe(PERMIT2_ADDRESS.toLowerCase())
    expect(sent[0].data.slice(0, 10)).toBe(PERMIT2_APPROVE)
  })
})

describe('fetchSourceBalance', () => {
  const OWNER = '0x972a34a8a7b9e19da849921f8d9d58f3d2df568b' as const
  const USDC = SOURCE_CHAINS.eth.tokens.USDC

  it('reads an ERC-20 balance via balanceOf(account)', async () => {
    let seen: { to: string; data: string } | undefined
    const provider = {
      request: async ({
        method,
        params,
      }: {
        method: string
        params?: readonly unknown[]
      }): Promise<unknown> => {
        if (method !== 'eth_call') throw new Error(`unexpected ${method}`)
        seen = (params?.[0] ?? {}) as { to: string; data: string }
        // balanceOf → 250000 (0.25 USDC at 6 decimals)
        return `0x${250_000n.toString(16).padStart(64, '0')}`
      },
    } as unknown as Provider.Provider

    const balance = await fetchSourceBalance({
      provider,
      token: USDC,
      owner: OWNER,
    })

    expect(balance).toBe(250_000n)
    expect(seen?.to.toLowerCase()).toBe(USDC.toLowerCase())
    expect(seen?.data.slice(0, 10)).toBe('0x70a08231') // balanceOf(address)
    expect(`0x${seen?.data.slice(-40)}`.toLowerCase()).toBe(OWNER)
  })

  it('reads the native balance via eth_getBalance for the native sentinel', async () => {
    let method: string | undefined
    const provider = {
      request: async (args: {
        method: string
        params?: readonly unknown[]
      }): Promise<unknown> => {
        method = args.method
        return `0x${(1_000_000_000_000_000_000n).toString(16)}` // 1 ETH
      },
    } as unknown as Provider.Provider

    const balance = await fetchSourceBalance({
      provider,
      token: NATIVE_TOKEN,
      owner: OWNER,
    })

    expect(balance).toBe(1_000_000_000_000_000_000n)
    expect(method).toBe('eth_getBalance')
  })
})

describe('computeFwssFloor', () => {
  // FWSS v1.3.0 new-dataset minimum = lifecycleReserveTarget + createDataSetFee
  // (the fixed funds the contract locks on the PDP rail at creation). The
  // minimum-rate floor and sybil fee were removed in v1.3.0.
  it('equals the FWSS new-dataset fixed funds at default pricing (0.125 USDfc)', () => {
    // 0.10 USDfc lifecycle reserve + 0.025 USDfc create fee = 0.125 USDfc.
    expect(
      computeFwssFloor(100_000_000_000_000_000n, 25_000_000_000_000_000n),
    ).toBe(125_000_000_000_000_000n)
  })

  it('tracks a raised lifecycle reserve or creation fee', () => {
    // 0.20 USDfc reserve + 0.05 USDfc create fee = 0.25 USDfc.
    expect(
      computeFwssFloor(200_000_000_000_000_000n, 50_000_000_000_000_000n),
    ).toBe(250_000_000_000_000_000n)
  })
})
