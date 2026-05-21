import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { setTimeout } from '../deps.js'
import { logger } from './logger.js'

export const SQUID_API = 'https://v2.api.squidrouter.com'

/**
 * Default integrator ID is the public Squid widget identity, the same one
 * the official Squid front-end at v2.app.squidrouter.com sends with every
 * request. No registration required; works out of the box.
 *
 * Power users with their own Squid integrator ID can override via the
 * `OMNIPIN_SQUID_INTEGRATOR_ID` environment variable for higher rate limits
 * and resilience against widget-ID throttling.
 */
export const getIntegratorId = (): string =>
  process.env.OMNIPIN_SQUID_INTEGRATOR_ID || 'squid-swap-widget'

/** Native asset sentinel used by Squid for chain-native gas tokens. */
export const NATIVE_TOKEN: Address =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

export type SquidRouteParams = {
  fromAddress: Address
  fromChain: string
  fromToken: Address
  fromAmount: string
  toChain: string
  toToken: Address
  toAddress: Address
  slippage: number
  enableExpress?: boolean
}

export type SquidTransactionRequest = {
  target: Address
  data: Hex
  value: string
  gasLimit?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  gasPrice?: string
  requestId?: string
  expiry?: number
  expiryOffset?: number
}

export type SquidAction = {
  type: string
  fromToken?: { symbol?: string }
  toToken?: { symbol?: string }
  provider?: string
}

export type SquidEstimate = {
  fromAmount?: string
  toAmount?: string
  toAmountMin?: string
  fromAmountUSD?: string
  toAmountUSD?: string
  estimatedRouteDuration?: number
  actions?: SquidAction[]
}

export type SquidRoute = {
  estimate: SquidEstimate
  transactionRequest: SquidTransactionRequest
  params?: { requestId?: string }
}

export type SquidRouteResponse = {
  route: SquidRoute
}

/**
 * Fetch a Squid route quote. Throws a descriptive error when Squid replies
 * with a non-2xx status, embedding a deeplink to the Squid web UI so the
 * user has a manual fallback path during API outages.
 */
export const getRoute = async ({
  params,
  integratorId = getIntegratorId(),
  fetchFn = fetch,
  requestId,
}: {
  params: SquidRouteParams
  integratorId?: string
  fetchFn?: typeof fetch
  /** Optional opaque trace ID returned in `x-request-id` response header. */
  requestId?: { value?: string }
}): Promise<SquidRoute> => {
  const res = await fetchFn(`${SQUID_API}/v2/route`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integrator-id': integratorId,
    },
    body: JSON.stringify(params),
  })

  if (requestId) {
    requestId.value =
      res.headers.get('x-request-id') ||
      res.headers.get('x-request-id-load-balancer') ||
      undefined
  }

  if (!res.ok) {
    let message: string | undefined
    try {
      const body = (await res.json()) as { message?: string; error?: string }
      message = body.message || body.error
    } catch {}

    const webUi = squidWebUiUrl(params)
    throw new Error(
      `Squid quote failed (${res.status}): ${
        message ?? res.statusText
      }. Fallback: ${webUi}`,
    )
  }

  const body = (await res.json()) as SquidRouteResponse
  if (!body.route) {
    throw new Error('Squid returned an empty route response')
  }
  return body.route
}

/** Build a deeplink to the Squid web UI mirroring the CLI's request. */
export const squidWebUiUrl = (params: SquidRouteParams): string => {
  const u = new URL('https://app.squidrouter.com')
  u.searchParams.set('chains', `${params.fromChain},${params.toChain}`)
  u.searchParams.set('tokens', `${params.fromToken},${params.toToken}`)
  return u.toString()
}

/**
 * Squid `/v2/status` response. `squidTransactionStatus` is the terminal
 * indicator; `ongoing` means keep polling, everything else is terminal.
 */
export type SquidStatusResponse = {
  squidTransactionStatus?: string
  status?: string
  toChain?: { transactionId?: string }
}

/** Terminal statuses per Squid docs (anything other than `ongoing`). */
const TERMINAL_STATUSES = new Set([
  'success',
  'partial_success',
  'needs_gas',
  'not_found',
  'refund',
])

export const getStatus = async ({
  transactionId,
  requestId,
  fromChainId,
  toChainId,
  integratorId = getIntegratorId(),
  fetchFn = fetch,
}: {
  transactionId: Hex
  requestId?: string
  fromChainId: string
  toChainId: string
  integratorId?: string
  fetchFn?: typeof fetch
}): Promise<SquidStatusResponse> => {
  const url = new URL(`${SQUID_API}/v2/status`)
  url.searchParams.set('transactionId', transactionId)
  if (requestId) url.searchParams.set('requestId', requestId)
  url.searchParams.set('fromChainId', String(fromChainId))
  url.searchParams.set('toChainId', String(toChainId))

  const res = await fetchFn(url.toString(), {
    headers: { 'x-integrator-id': integratorId },
  })

  if (res.status === 404) {
    // Relayer hasn't indexed the source tx yet — treat as ongoing.
    return { squidTransactionStatus: 'ongoing' }
  }
  if (!res.ok) {
    throw new Error(`Squid /v2/status returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as SquidStatusResponse
}

/**
 * Poll Squid `/v2/status` until the cross-chain swap reaches a terminal
 * state. Resolves on `success` / `partial_success`, throws otherwise.
 */
export const pollSquidStatus = async ({
  transactionId,
  requestId,
  fromChainId,
  toChainId,
  maxAttempts = 60,
  intervalMs = 10_000,
  warmupAttempts = 6,
  onAttempt,
  fetchFn = fetch,
  integratorId = getIntegratorId(),
}: {
  transactionId: Hex
  requestId?: string
  fromChainId: string
  toChainId: string
  maxAttempts?: number
  intervalMs?: number
  warmupAttempts?: number
  onAttempt?: (attempt: number, status: string | null) => void
  fetchFn?: typeof fetch
  integratorId?: string
}): Promise<SquidStatusResponse> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: SquidStatusResponse | undefined
    let status: string | null = null
    try {
      response = await getStatus({
        transactionId,
        requestId,
        fromChainId,
        toChainId,
        fetchFn,
        integratorId,
      })
      status = response.squidTransactionStatus ?? null
    } catch (e) {
      // Tolerate transient errors during the warm-up window.
      if (attempt > warmupAttempts) throw e
    }

    onAttempt?.(attempt, status)

    if (status && TERMINAL_STATUSES.has(status)) {
      if (status === 'success' || status === 'partial_success') {
        return response!
      }
      throw new Error(
        `Squid bridge ended in non-success state: ${status} (axelarscan: https://axelarscan.io/gmp/${transactionId})`,
      )
    }

    if (attempt < maxAttempts) await setTimeout(intervalMs)
  }

  throw new Error(
    `Squid bridge poll timed out after ${maxAttempts} attempts for tx ${transactionId}`,
  )
}

/**
 * Retrying wrapper around `getRoute`. Handles Squid's per-address quote
 * rate limit (responds with `error: "Too many quote requests for this
 * address"` and a `retryAfter` field) by waiting and retrying.
 */
export const getRouteWithRetry = async ({
  params,
  attempts = 3,
  initialDelayMs = 5_000,
  fetchFn = fetch,
  integratorId = getIntegratorId(),
}: {
  params: SquidRouteParams
  attempts?: number
  initialDelayMs?: number
  fetchFn?: typeof fetch
  integratorId?: string
}): Promise<SquidRoute> => {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await getRoute({ params, integratorId, fetchFn })
    } catch (e) {
      lastErr = e
      const msg = (e as Error).message || ''
      if (msg.includes('Too many quote requests')) {
        const delay = initialDelayMs * 2 ** i
        logger.warn(`Squid rate-limited; retrying in ${delay}ms`)
        await setTimeout(delay)
        continue
      }
      // Non-retryable: surface immediately.
      throw e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Squid retry exhausted')
}
