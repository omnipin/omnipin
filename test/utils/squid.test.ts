import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  getRoute,
  getRouteWithRetry,
  getStatus,
  NATIVE_TOKEN,
  pollSquidStatus,
  SQUID_API,
  type SquidRouteParams,
  squidWebUiUrl,
} from '../../src/utils/squid.js'

const SAMPLE_PARAMS: SquidRouteParams = {
  fromAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  fromChain: "42161",
  fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  fromAmount: '10000000',
  toChain: "314",
  toToken: '0x80b98d3aa09ffff255c3ba4a241111ff1262f045',
  toAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  slippage: 1,
}

const TX_HASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const

const sampleRouteBody = () => ({
  route: {
    estimate: {
      fromAmount: '10000000',
      toAmount: '998000000000000000',
      toAmountMin: '988000000000000000',
      fromAmountUSD: '9.99',
      toAmountUSD: '9.96',
      estimatedRouteDuration: 150,
      actions: [
        {
          type: 'swap',
          fromToken: { symbol: 'USDC' },
          toToken: { symbol: 'USDC.axl' },
          provider: 'Pancakeswap V3',
        },
        {
          type: 'bridge',
          fromToken: { symbol: 'USDC.axl' },
          toToken: { symbol: 'USDC.axl' },
          provider: 'Axelar',
        },
        {
          type: 'swap',
          fromToken: { symbol: 'USDC.axl' },
          toToken: { symbol: 'USDFC' },
          provider: 'Sushiswap V3',
        },
      ],
    },
    transactionRequest: {
      target: '0xce16F69375520ab01377ce7B88f5BA8C48F8D666',
      data: '0xdeadbeef',
      value: '0',
      gasLimit: '1000000',
    },
    params: { requestId: 'req-abc-123' },
  },
})

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

describe('squid utils', () => {
  const originalFetch = globalThis.fetch
  const originalIntegrator = process.env.OMNIPIN_SQUID_INTEGRATOR_ID

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalIntegrator === undefined)
      delete process.env.OMNIPIN_SQUID_INTEGRATOR_ID
    else process.env.OMNIPIN_SQUID_INTEGRATOR_ID = originalIntegrator
  })

  describe('getRoute', () => {
    it('sends the public widget integrator id by default and parses the route', async () => {
      delete process.env.OMNIPIN_SQUID_INTEGRATOR_ID
      let seenHeaders: Record<string, string> | undefined
      const fetchFn = mock(
        async (url: string | URL | Request, init?: RequestInit) => {
          expect(String(url)).toBe(`${SQUID_API}/v2/route`)
          seenHeaders = Object.fromEntries(new Headers(init?.headers).entries())
          return jsonResponse(sampleRouteBody())
        },
      ) as unknown as typeof fetch

      const route = await getRoute({ params: SAMPLE_PARAMS, fetchFn })
      expect(route.estimate.toAmount).toBe('998000000000000000')
      expect(route.transactionRequest.target).toBe(
        '0xce16F69375520ab01377ce7B88f5BA8C48F8D666',
      )
      expect(route.params?.requestId).toBe('req-abc-123')
      expect(seenHeaders?.['x-integrator-id']).toBe('squid-swap-widget')
    })

    it('honours OMNIPIN_SQUID_INTEGRATOR_ID override', async () => {
      process.env.OMNIPIN_SQUID_INTEGRATOR_ID = 'my-integrator-id'
      let seenHeaders: Record<string, string> | undefined
      const fetchFn = mock(
        async (_url: string | URL | Request, init?: RequestInit) => {
          seenHeaders = Object.fromEntries(new Headers(init?.headers).entries())
          return jsonResponse(sampleRouteBody())
        },
      ) as unknown as typeof fetch

      await getRoute({ params: SAMPLE_PARAMS, fetchFn })
      expect(seenHeaders?.['x-integrator-id']).toBe('my-integrator-id')
    })

    it('throws with the web UI fallback link on non-2xx', async () => {
      const fetchFn = mock(async () =>
        jsonResponse(
          { message: 'Apologies, swaps are currently unavailable.' },
          403,
        ),
      ) as unknown as typeof fetch

      await expect(
        getRoute({ params: SAMPLE_PARAMS, fetchFn }),
      ).rejects.toThrow(/Fallback: https:\/\/app\.squidrouter\.com/)
    })
  })

  describe('squidWebUiUrl', () => {
    it('encodes from/to chains and tokens', () => {
      const url = squidWebUiUrl(SAMPLE_PARAMS)
      expect(url).toContain('chains=42161%2C314')
      expect(url).toContain(SAMPLE_PARAMS.fromToken)
      expect(url).toContain(SAMPLE_PARAMS.toToken)
    })
  })

  describe('getStatus', () => {
    it('treats 404 as ongoing', async () => {
      const fetchFn = mock(
        async () => new Response('', { status: 404 }),
      ) as unknown as typeof fetch
      const res = await getStatus({
        transactionId: TX_HASH,
        fromChainId: "42161",
        toChainId: "314",
        fetchFn,
      })
      expect(res.squidTransactionStatus).toBe('ongoing')
    })

    it('returns the status body on 200', async () => {
      const fetchFn = mock(async () =>
        jsonResponse({ squidTransactionStatus: 'success' }),
      ) as unknown as typeof fetch
      const res = await getStatus({
        transactionId: TX_HASH,
        fromChainId: "42161",
        toChainId: "314",
        fetchFn,
      })
      expect(res.squidTransactionStatus).toBe('success')
    })
  })

  describe('pollSquidStatus', () => {
    it('resolves on success', async () => {
      const fetchFn = mock(async () =>
        jsonResponse({ squidTransactionStatus: 'success' }),
      ) as unknown as typeof fetch
      const res = await pollSquidStatus({
        transactionId: TX_HASH,
        fromChainId: "42161",
        toChainId: "314",
        intervalMs: 1,
        fetchFn,
      })
      expect(res.squidTransactionStatus).toBe('success')
    })

    it('resolves on partial_success', async () => {
      const fetchFn = mock(async () =>
        jsonResponse({ squidTransactionStatus: 'partial_success' }),
      ) as unknown as typeof fetch
      const res = await pollSquidStatus({
        transactionId: TX_HASH,
        fromChainId: "42161",
        toChainId: "314",
        intervalMs: 1,
        fetchFn,
      })
      expect(res.squidTransactionStatus).toBe('partial_success')
    })

    it('throws on refund', async () => {
      const fetchFn = mock(async () =>
        jsonResponse({ squidTransactionStatus: 'refund' }),
      ) as unknown as typeof fetch
      await expect(
        pollSquidStatus({
          transactionId: TX_HASH,
          fromChainId: "42161",
          toChainId: "314",
          intervalMs: 1,
          fetchFn,
        }),
      ).rejects.toThrow(/refund/)
    })

    it('throws on needs_gas', async () => {
      const fetchFn = mock(async () =>
        jsonResponse({ squidTransactionStatus: 'needs_gas' }),
      ) as unknown as typeof fetch
      await expect(
        pollSquidStatus({
          transactionId: TX_HASH,
          fromChainId: "42161",
          toChainId: "314",
          intervalMs: 1,
          fetchFn,
        }),
      ).rejects.toThrow(/needs_gas/)
    })

    it('tolerates warmup 404s and eventually resolves', async () => {
      let n = 0
      const fetchFn = mock(async () => {
        n += 1
        if (n < 3) return new Response('', { status: 404 })
        return jsonResponse({ squidTransactionStatus: 'success' })
      }) as unknown as typeof fetch
      const res = await pollSquidStatus({
        transactionId: TX_HASH,
        fromChainId: "42161",
        toChainId: "314",
        intervalMs: 1,
        warmupAttempts: 5,
        fetchFn,
      })
      expect(res.squidTransactionStatus).toBe('success')
      expect(n).toBe(3)
    })

    it('times out if status never reaches terminal', async () => {
      const fetchFn = mock(async () =>
        jsonResponse({ squidTransactionStatus: 'ongoing' }),
      ) as unknown as typeof fetch
      await expect(
        pollSquidStatus({
          transactionId: TX_HASH,
          fromChainId: "42161",
          toChainId: "314",
          intervalMs: 1,
          maxAttempts: 3,
          fetchFn,
        }),
      ).rejects.toThrow(/timed out/)
    })
  })

  describe('getRouteWithRetry', () => {
    it('retries on "Too many quote requests" then resolves', async () => {
      let n = 0
      const fetchFn = mock(async () => {
        n += 1
        if (n === 1) {
          return jsonResponse(
            { error: 'Too many quote requests for this address' },
            429,
          )
        }
        return jsonResponse(sampleRouteBody())
      }) as unknown as typeof fetch

      const route = await getRouteWithRetry({
        params: SAMPLE_PARAMS,
        attempts: 3,
        initialDelayMs: 1,
        fetchFn,
      })
      expect(route.estimate.toAmountUSD).toBe('9.96')
      expect(n).toBe(2)
    })

    it('surfaces non-rate-limit errors immediately without retry', async () => {
      const fetchFn = mock(async () =>
        jsonResponse(
          { message: 'Apologies, swaps are currently unavailable.' },
          403,
        ),
      ) as unknown as typeof fetch

      await expect(
        getRouteWithRetry({
          params: SAMPLE_PARAMS,
          attempts: 3,
          initialDelayMs: 1,
          fetchFn,
        }),
      ).rejects.toThrow(/Squid quote failed/)
      // Should only be called once (no retry on non-429 errors).
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('NATIVE_TOKEN', () => {
    it('is the canonical 0xeee… sentinel', () => {
      expect(NATIVE_TOKEN).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
    })
  })
})
