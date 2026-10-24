import * as assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
// Import from src/index.js first: starting module evaluation at filecoin.js
// trips the logger → constants → filecoin import cycle (see
// filecoin-status.test.ts).
import { DeployError } from '../../src/index.js'
import { findPiece } from '../../src/providers/ipfs/filecoin.js'

const SP_URL = 'https://sp.example.com'
const PIECE_CID =
  'bafkzcibcoibrgmrvgiztgmjqgiztgmjqgiztgmjqgiztgmjqgiztgmjqgizq'

const originalFetch = globalThis.fetch

// undici surfaces a connect timeout as `TypeError: fetch failed` with a
// ConnectTimeoutError cause.
const connectTimeout = () =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('Connect Timeout Error'), {
      code: 'UND_ERR_CONNECT_TIMEOUT',
    }),
  })

describe('Filecoin findPiece', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('keeps polling after a transient network error', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) throw connectTimeout()
      return new Response(null, { status: 200 })
    }) as typeof fetch

    await findPiece(SP_URL, PIECE_CID, { timeoutMs: 1000, pollInterval: 1 })
    assert.strictEqual(calls, 2)
  })

  it('throws DeployError with the last network error once the budget runs out', async () => {
    globalThis.fetch = (async () => {
      throw connectTimeout()
    }) as typeof fetch

    await assert.rejects(
      findPiece(SP_URL, PIECE_CID, { timeoutMs: 50, pollInterval: 1 }),
      (err: Error) =>
        err instanceof DeployError && /Connect Timeout Error/.test(err.message),
    )
  })
})
