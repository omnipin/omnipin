import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  AIOZ_BRIDGE_API,
  fetchPoolAddress,
  pollSwapStatus,
} from '../../src/utils/aioz-bridge.js'

const POOL = '0x1111111111111111111111111111111111111111'
const TX_HASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const

const makeResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('aioz-bridge', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('fetchPoolAddress', () => {
    it('returns the matching pool address', async () => {
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        expect(String(url)).toBe(`${AIOZ_BRIDGE_API}/swap-directions`)
        return makeResponse([
          {
            from_network: 'eth',
            to_network: 'aioz',
            asset: 'AIOZ',
            pool_address: POOL,
            swap_type: 'ETH_AIOZ_AIOZ',
          },
          {
            from_network: 'bsc',
            to_network: 'aioz',
            asset: 'AIOZ',
            pool_address: '0x2222222222222222222222222222222222222222',
            swap_type: 'BSC_AIOZ_AIOZ',
          },
        ])
      }) as unknown as typeof fetch

      const pool = await fetchPoolAddress({ from: 'eth', to: 'aioz' })
      expect(pool).toBe(POOL)
    })

    it('throws if no matching direction exists', async () => {
      globalThis.fetch = mock(async () =>
        makeResponse([
          {
            from_network: 'bsc',
            to_network: 'eth',
            asset: 'AIOZ',
            pool_address: POOL,
            swap_type: 'BSC_ETH_AIOZ',
          },
        ]),
      ) as unknown as typeof fetch

      await expect(
        fetchPoolAddress({ from: 'eth', to: 'aioz' }),
      ).rejects.toThrow(/No AIOZ bridge direction/)
    })

    it('throws when the bridge API returns non-2xx', async () => {
      globalThis.fetch = mock(
        async () =>
          new Response('boom', { status: 500, statusText: 'Server Error' }),
      ) as unknown as typeof fetch

      await expect(
        fetchPoolAddress({ from: 'eth', to: 'aioz' }),
      ).rejects.toThrow(/returned 500/)
    })
  })

  describe('pollSwapStatus', () => {
    it('resolves immediately when status is sent', async () => {
      const fetchFn = mock(async () =>
        makeResponse({ status: 'sent', tx_out: '0xdeadbeef' }),
      ) as unknown as typeof fetch

      const result = await pollSwapStatus({
        srcTxHash: TX_HASH,
        intervalMs: 1,
        fetchFn,
      })
      expect(result).toEqual({ status: 'sent', txOut: '0xdeadbeef' })
    })

    it('throws when status is fail', async () => {
      const fetchFn = mock(async () =>
        makeResponse({ status: 'fail' }),
      ) as unknown as typeof fetch

      await expect(
        pollSwapStatus({ srcTxHash: TX_HASH, intervalMs: 1, fetchFn }),
      ).rejects.toThrow(/reported failure/)
    })

    it('tolerates warmup 404s and eventually resolves', async () => {
      let attempt = 0
      const fetchFn = mock(async () => {
        attempt += 1
        if (attempt < 3) {
          return new Response('not found', {
            status: 404,
            statusText: 'Not Found',
          })
        }
        return makeResponse({ status: 'sent', tx_out: '0xfeed' })
      }) as unknown as typeof fetch

      const result = await pollSwapStatus({
        srcTxHash: TX_HASH,
        intervalMs: 1,
        warmupAttempts: 5,
        fetchFn,
      })

      expect(result.status).toBe('sent')
      expect(result.txOut).toBe('0xfeed')
      expect(attempt).toBe(3)
    })

    it('throws if 404 persists past warmup', async () => {
      const fetchFn = mock(
        async () =>
          new Response('not found', {
            status: 404,
            statusText: 'Not Found',
          }),
      ) as unknown as typeof fetch

      await expect(
        pollSwapStatus({
          srcTxHash: TX_HASH,
          intervalMs: 1,
          warmupAttempts: 1,
          maxAttempts: 3,
          fetchFn,
        }),
      ).rejects.toThrow(/404 after warmup/)
    })

    it('times out if status never reaches sent', async () => {
      const fetchFn = mock(async () =>
        makeResponse({ status: 'sending' }),
      ) as unknown as typeof fetch

      await expect(
        pollSwapStatus({
          srcTxHash: TX_HASH,
          intervalMs: 1,
          maxAttempts: 3,
          fetchFn,
        }),
      ).rejects.toThrow(/timed out/)
    })
  })
})
