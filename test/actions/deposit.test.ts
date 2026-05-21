import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
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

  beforeEach(() => {
    originalPk = process.env.OMNIPIN_PK
    delete process.env.OMNIPIN_PK
  })

  afterEach(() => {
    if (originalPk === undefined) delete process.env.OMNIPIN_PK
    else process.env.OMNIPIN_PK = originalPk
  })

  it('throws MissingCLIArgsError if amount is missing', async () => {
    await expect(
      depositAction({ amount: '', options: { provider: 'Filecoin' } }),
    ).rejects.toBeInstanceOf(MissingCLIArgsError)
  })

  it('throws MissingCLIArgsError if provider is missing', async () => {
    await expect(
      depositAction({ amount: '1', options: {} }),
    ).rejects.toBeInstanceOf(MissingCLIArgsError)
  })

  it('throws UnknownProviderError for unsupported providers', async () => {
    await expect(
      depositAction({ amount: '1', options: { provider: 'Pinata' } }),
    ).rejects.toBeInstanceOf(UnknownProviderError)
  })

  it('throws UnknownProviderError for AIOZ (no deposit step)', async () => {
    // AIOZ has no separate deposit contract — bridge is the whole flow.
    await expect(
      depositAction({ amount: '1', options: { provider: 'AIOZ' } }),
    ).rejects.toBeInstanceOf(UnknownProviderError)
  })

  it('throws MissingKeyError when OMNIPIN_PK is not set', async () => {
    await expect(
      depositAction({ amount: '1', options: { provider: 'Filecoin' } }),
    ).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('rejects non-positive amounts', async () => {
    process.env.OMNIPIN_PK = DUMMY_PK
    await expect(
      depositAction({ amount: '0', options: { provider: 'Filecoin' } }),
    ).rejects.toThrow(/must be positive/)
  })

  it('rejects malformed amounts', async () => {
    process.env.OMNIPIN_PK = DUMMY_PK
    await expect(
      depositAction({
        amount: 'not-a-number',
        options: { provider: 'Filecoin' },
      }),
    ).rejects.toThrow(/Invalid amount/)
  })
})
