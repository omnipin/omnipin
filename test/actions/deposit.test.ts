import * as assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { depositAction } from '../../src/actions/deposit.js'
import {
  MissingCLIArgsError,
  MissingKeyError,
  UnknownProviderError,
} from '../../src/errors.js'

const DUMMY_PK =
  '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'

describe('deposit action', () => {
  let originalPk: string | undefined
  let originalFilecoinToken: string | undefined

  beforeEach(() => {
    originalPk = process.env.OMNIPIN_PK
    originalFilecoinToken = process.env.OMNIPIN_FILECOIN_TOKEN
    delete process.env.OMNIPIN_PK
    delete process.env.OMNIPIN_FILECOIN_TOKEN
  })

  afterEach(() => {
    if (originalPk === undefined) delete process.env.OMNIPIN_PK
    else process.env.OMNIPIN_PK = originalPk
    if (originalFilecoinToken === undefined)
      delete process.env.OMNIPIN_FILECOIN_TOKEN
    else process.env.OMNIPIN_FILECOIN_TOKEN = originalFilecoinToken
  })

  it('throws MissingCLIArgsError if amount is missing', async () => {
    await assert.rejects(
      depositAction({ amount: '', options: { provider: 'Filecoin' } }),
      MissingCLIArgsError,
    )
  })

  it('throws MissingCLIArgsError if provider is missing', async () => {
    await assert.rejects(
      depositAction({ amount: '1', options: {} }),
      MissingCLIArgsError,
    )
  })

  it('throws UnknownProviderError for unsupported providers', async () => {
    await assert.rejects(
      depositAction({ amount: '1', options: { provider: 'Pinata' } }),
      UnknownProviderError,
    )
  })

  it('throws UnknownProviderError for AIOZ (no deposit step)', async () => {
    // AIOZ has no separate deposit contract — bridge is the whole flow.
    await assert.rejects(
      depositAction({ amount: '1', options: { provider: 'AIOZ' } }),
      UnknownProviderError,
    )
  })

  it('throws MissingKeyError when no signing key is set', async () => {
    await assert.rejects(
      depositAction({ amount: '1', options: { provider: 'Filecoin' } }),
      MissingKeyError,
    )
  })

  it('names OMNIPIN_FILECOIN_TOKEN in the MissingKeyError for Filecoin', async () => {
    await assert.rejects(
      depositAction({ amount: '1', options: { provider: 'Filecoin' } }),
      /OMNIPIN_FILECOIN_TOKEN/,
    )
  })

  describe('with a signing key', () => {
    beforeEach(() => {
      process.env.OMNIPIN_PK = DUMMY_PK
    })

    it('rejects non-positive amounts', async () => {
      await assert.rejects(
        depositAction({ amount: '0', options: { provider: 'Filecoin' } }),
        /must be positive/,
      )
    })

    it('rejects malformed amounts', async () => {
      await assert.rejects(
        depositAction({
          amount: 'not-a-number',
          options: { provider: 'Filecoin' },
        }),
        /Invalid amount/,
      )
    })

    // The deposit is authorized with an EIP-2612 permit whose `owner` is
    // `--from` but which is signed with the signer's key, so a mismatch could
    // never produce a landable transaction. It must be rejected before any
    // gas is spent — i.e. before the amount is even parsed.
    it('rejects --from when it is not the signing wallet', async () => {
      await assert.rejects(
        depositAction({
          amount: '1',
          options: {
            provider: 'Filecoin',
            from: '0x0000000000000000000000000000000000000001',
          },
        }),
        /is not the signer/,
      )
    })

    it('rejects a mismatched --from before validating the amount', async () => {
      await assert.rejects(
        depositAction({
          amount: 'not-a-number',
          options: {
            provider: 'Filecoin',
            from: '0x0000000000000000000000000000000000000001',
          },
        }),
        /is not the signer/,
      )
    })
  })
})
