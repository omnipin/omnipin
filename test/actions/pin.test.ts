import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { pinAction } from '../../src/actions/pin.js'
import { PROVIDERS } from '../../src/constants.js'
import { AllProvidersFailedError } from '../../src/errors.js'

const DUMMY_CID = 'bafybeibwzif3z6vjyz5fr4xj4exadgz3y3qhrhqycnf6jb6e2pwpgqaa3a'

describe('pin action', () => {
  let originalPinataToken: string | undefined
  let originalPinataUpload: typeof PROVIDERS.PINATA_TOKEN.upload

  beforeEach(() => {
    originalPinataToken = process.env.OMNIPIN_PINATA_TOKEN
    process.env.OMNIPIN_PINATA_TOKEN = 'test-token'
    originalPinataUpload = PROVIDERS.PINATA_TOKEN.upload
  })

  afterEach(() => {
    if (originalPinataToken === undefined)
      delete process.env.OMNIPIN_PINATA_TOKEN
    else process.env.OMNIPIN_PINATA_TOKEN = originalPinataToken
    PROVIDERS.PINATA_TOKEN.upload = originalPinataUpload
  })

  it('throws AllProvidersFailedError when every provider fails', async () => {
    PROVIDERS.PINATA_TOKEN.upload = async () => {
      throw new TypeError('fetch failed')
    }

    await expect(
      pinAction({ cid: DUMMY_CID, options: {} }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError)
  })

  it('AllProvidersFailedError exposes operation "pin" and underlying errors', async () => {
    const cause = new TypeError('fetch failed')
    PROVIDERS.PINATA_TOKEN.upload = async () => {
      throw cause
    }

    try {
      await pinAction({ cid: DUMMY_CID, options: {} })
      throw new Error('pinAction should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AllProvidersFailedError)
      const aggregate = err as AllProvidersFailedError
      expect(aggregate.operation).toBe('pin')
      expect(aggregate.errors).toContain(cause)
    }
  })

  it('rethrows immediately in strict mode', async () => {
    const cause = new TypeError('fetch failed')
    PROVIDERS.PINATA_TOKEN.upload = async () => {
      throw cause
    }

    await expect(
      pinAction({ cid: DUMMY_CID, options: { strict: true } }),
    ).rejects.toBe(cause)
  })
})
