import * as assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
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
  fromChain: '42161',
  fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  fromAmount: '10000000',
  toChain: '314',
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
      const fetchFn = mock.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          assert.strictEqual(String(url), `${SQUID_API}/v2/route`)
          seenHeaders = Object.fromEntries(new Headers(init?.headers).entries())
          return jsonResponse(sampleRouteBody())
        },
      ) as unknown as typeof fetch

      const route = await getRoute({ params: SAMPLE_PARAMS, fetchFn })
      assert.strictEqual(route.estimate.toAmount, '998000000000000000')
      assert.strictEqual(
        route.transactionRequest.target,
        '0xce16F69375520ab01377ce7B88f5BA8C48F8D666',
      )
      assert.strictEqual(route.params?.requestId, 'req-abc-123')
      assert.strictEqual(seenHeaders?.['x-integrator-id'], 'squid-swap-widget')
    })

    it('honours OMNIPIN_SQUID_INTEGRATOR_ID override', async () => {
      process.env.OMNIPIN_SQUID_INTEGRATOR_ID = 'my-integrator-id'
      let seenHeaders: Record<string, string> | undefined
      const fetchFn = mock.fn(
        async (_url: string | URL | Request, init?: RequestInit) => {
          seenHeaders = Object.fromEntries(new Headers(init?.headers).entries())
          return jsonResponse(sampleRouteBody())
        },
      ) as unknown as typeof fetch

      await getRoute({ params: SAMPLE_PARAMS, fetchFn })
      assert.strictEqual(seenHeaders?.['x-integrator-id'], 'my-integrator-id')
    })

    it('throws with the web UI fallback link on non-2xx', async () => {
      const fetchFn = mock.fn(async () =>
        jsonResponse(
          { message: 'Apologies, swaps are currently unavailable.' },
          403,
        ),
      ) as unknown as typeof fetch

      await assert.rejects(
        getRoute({ params: SAMPLE_PARAMS, fetchFn }),
        /Fallback: https:\/\/app\.squidrouter\.com/,
      )
    })
  })

  describe('squidWebUiUrl', () => {
    it('encodes from/to chains and tokens', () => {
      const url = squidWebUiUrl(SAMPLE_PARAMS)
      assert.ok(url.includes('chains=42161%2C314'))
      assert.ok(url.includes(SAMPLE_PARAMS.fromToken))
      assert.ok(url.includes(SAMPLE_PARAMS.toToken))
    })
  })

  describe('getStatus', () => {
    it('treats 404 as ongoing', async () => {
      const fetchFn = mock.fn(
        async () => new Response('', { status: 404 }),
      ) as unknown as typeof fetch
      const res = await getStatus({
        transactionId: TX_HASH,
        fromChainId: '42161',
        toChainId: '314',
        fetchFn,
      })
      assert.strictEqual(res.squidTransactionStatus, 'ongoing')
    })

    it('returns the status body on 200', async () => {
      const fetchFn = mock.fn(async () =>
        jsonResponse({ squidTransactionStatus: 'success' }),
      ) as unknown as typeof fetch
      const res = await getStatus({
        transactionId: TX_HASH,
        fromChainId: '42161',
        toChainId: '314',
        fetchFn,
      })
      assert.strictEqual(res.squidTransactionStatus, 'success')
    })
  })

  describe('pollSquidStatus', () => {
    it('resolves on success', async () => {
      const fetchFn = mock.fn(async () =>
        jsonResponse({ squidTransactionStatus: 'success' }),
      ) as unknown as typeof fetch
      const res = await pollSquidStatus({
        transactionId: TX_HASH,
        fromChainId: '42161',
        toChainId: '314',
        intervalMs: 1,
        fetchFn,
      })
      assert.strictEqual(res.squidTransactionStatus, 'success')
    })

    it('resolves on partial_success', async () => {
      const fetchFn = mock.fn(async () =>
        jsonResponse({ squidTransactionStatus: 'partial_success' }),
      ) as unknown as typeof fetch
      const res = await pollSquidStatus({
        transactionId: TX_HASH,
        fromChainId: '42161',
        toChainId: '314',
        intervalMs: 1,
        fetchFn,
      })
      assert.strictEqual(res.squidTransactionStatus, 'partial_success')
    })

    it('throws on refund', async () => {
      const fetchFn = mock.fn(async () =>
        jsonResponse({ squidTransactionStatus: 'refund' }),
      ) as unknown as typeof fetch
      await assert.rejects(
        pollSquidStatus({
          transactionId: TX_HASH,
          fromChainId: '42161',
          toChainId: '314',
          intervalMs: 1,
          fetchFn,
        }),
        /refund/,
      )
    })

    it('throws on needs_gas', async () => {
      const fetchFn = mock.fn(async () =>
        jsonResponse({ squidTransactionStatus: 'needs_gas' }),
      ) as unknown as typeof fetch
      await assert.rejects(
        pollSquidStatus({
          transactionId: TX_HASH,
          fromChainId: '42161',
          toChainId: '314',
          intervalMs: 1,
          fetchFn,
        }),
        /needs_gas/,
      )
    })

    it('tolerates warmup 404s and eventually resolves', async () => {
      let n = 0
      const fetchFn = mock.fn(async () => {
        n += 1
        if (n < 3) return new Response('', { status: 404 })
        return jsonResponse({ squidTransactionStatus: 'success' })
      }) as unknown as typeof fetch
      const res = await pollSquidStatus({
        transactionId: TX_HASH,
        fromChainId: '42161',
        toChainId: '314',
        intervalMs: 1,
        warmupAttempts: 5,
        fetchFn,
      })
      assert.strictEqual(res.squidTransactionStatus, 'success')
      assert.strictEqual(n, 3)
    })

    it('times out if status never reaches terminal', async () => {
      const fetchFn = mock.fn(async () =>
        jsonResponse({ squidTransactionStatus: 'ongoing' }),
      ) as unknown as typeof fetch
      await assert.rejects(
        pollSquidStatus({
          transactionId: TX_HASH,
          fromChainId: '42161',
          toChainId: '314',
          intervalMs: 1,
          maxAttempts: 3,
          fetchFn,
        }),
        /timed out/,
      )
    })
  })

  describe('getRouteWithRetry', () => {
    it('retries on "Too many quote requests" then resolves', async () => {
      let n = 0
      const fetchFn = mock.fn(async () => {
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
      assert.strictEqual(route.estimate.toAmountUSD, '9.96')
      assert.strictEqual(n, 2)
    })

    it('surfaces non-rate-limit errors immediately without retry', async () => {
      const fetchFn = mock.fn(async () =>
        jsonResponse(
          { message: 'Apologies, swaps are currently unavailable.' },
          403,
        ),
      )

      await assert.rejects(
        getRouteWithRetry({
          params: SAMPLE_PARAMS,
          attempts: 3,
          initialDelayMs: 1,
          fetchFn: fetchFn as unknown as typeof fetch,
        }),
        /Squid quote failed/,
      )
      // Should only be called once (no retry on non-429 errors).
      assert.strictEqual(fetchFn.mock.callCount(), 1)
    })
  })

  describe('NATIVE_TOKEN', () => {
    it('is the canonical 0xeee… sentinel', () => {
      assert.strictEqual(
        NATIVE_TOKEN,
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      )
    })
  })
})
