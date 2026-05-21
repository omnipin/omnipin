import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { topupAction } from '../../src/actions/topup.js'
import {
  MissingCLIArgsError,
  MissingKeyError,
  UnknownProviderError,
} from '../../src/errors.js'

const DUMMY_PK =
  '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'

describe('topup action', () => {
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
      topupAction({ amount: '', options: { provider: 'AIOZ' } }),
    ).rejects.toBeInstanceOf(MissingCLIArgsError)
  })

  it('throws MissingCLIArgsError if provider is missing', async () => {
    await expect(
      topupAction({ amount: '1', options: {} }),
    ).rejects.toBeInstanceOf(MissingCLIArgsError)
  })

  it('throws UnknownProviderError for unsupported providers', async () => {
    await expect(
      topupAction({
        amount: '1',
        options: { provider: 'Filecoin', 'from-chain': 'eth' },
      }),
    ).rejects.toBeInstanceOf(UnknownProviderError)
  })

  it('throws MissingKeyError when OMNIPIN_PK is not set', async () => {
    await expect(
      topupAction({
        amount: '1',
        options: { provider: 'AIOZ', 'from-chain': 'eth' },
      }),
    ).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('throws MissingCLIArgsError for invalid --from-chain', async () => {
    process.env.OMNIPIN_PK = DUMMY_PK
    await expect(
      topupAction({
        amount: '1',
        options: { provider: 'AIOZ', 'from-chain': 'polygon' },
      }),
    ).rejects.toBeInstanceOf(MissingCLIArgsError)
  })

  it('throws MissingCLIArgsError if --from-chain is missing for AIOZ', async () => {
    process.env.OMNIPIN_PK = DUMMY_PK
    await expect(
      topupAction({
        amount: '1',
        options: { provider: 'AIOZ' },
      }),
    ).rejects.toBeInstanceOf(MissingCLIArgsError)
  })

  it('rejects non-positive amounts', async () => {
    process.env.OMNIPIN_PK = DUMMY_PK
    await expect(
      topupAction({
        amount: '0',
        options: { provider: 'AIOZ', 'from-chain': 'eth' },
      }),
    ).rejects.toThrow(/must be positive/)
  })

  it('rejects malformed amounts', async () => {
    process.env.OMNIPIN_PK = DUMMY_PK
    await expect(
      topupAction({
        amount: 'not-a-number',
        options: { provider: 'AIOZ', 'from-chain': 'eth' },
      }),
    ).rejects.toThrow(/Invalid amount/)
  })
})
