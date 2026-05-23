import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { deployAction } from '../../src/actions/deploy.js'
import { PROVIDERS } from '../../src/constants.js'
import { AllProvidersFailedError } from '../../src/errors.js'

describe('deploy action', () => {
  let originalBeeToken: string | undefined
  let originalBeeUpload: typeof PROVIDERS.BEE_TOKEN.upload

  beforeEach(() => {
    originalBeeToken = process.env.OMNIPIN_BEE_TOKEN
    process.env.OMNIPIN_BEE_TOKEN = 'test-token'
    originalBeeUpload = PROVIDERS.BEE_TOKEN.upload
  })

  afterEach(() => {
    if (originalBeeToken === undefined) delete process.env.OMNIPIN_BEE_TOKEN
    else process.env.OMNIPIN_BEE_TOKEN = originalBeeToken
    PROVIDERS.BEE_TOKEN.upload = originalBeeUpload
  })

  it('throws AllProvidersFailedError when every provider fails', async () => {
    PROVIDERS.BEE_TOKEN.upload = async () => {
      throw new TypeError('fetch failed')
    }

    await expect(
      deployAction({
        dir: 'test/fixtures/walk',
        options: { 'progress-bar': false },
      }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError)
  })

  it('AllProvidersFailedError exposes the underlying errors via AggregateError', async () => {
    const cause = new TypeError('fetch failed')
    PROVIDERS.BEE_TOKEN.upload = async () => {
      throw cause
    }

    try {
      await deployAction({
        dir: 'test/fixtures/walk',
        options: { 'progress-bar': false },
      })
      throw new Error('deployAction should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AllProvidersFailedError)
      const aggregate = err as AllProvidersFailedError
      expect(aggregate.operation).toBe('deploy')
      expect(aggregate.errors).toContain(cause)
    }
  })

  it('rethrows immediately in strict mode', async () => {
    const cause = new TypeError('fetch failed')
    PROVIDERS.BEE_TOKEN.upload = async () => {
      throw cause
    }

    await expect(
      deployAction({
        dir: 'test/fixtures/walk',
        options: { strict: true, 'progress-bar': false },
      }),
    ).rejects.toBe(cause)
  })
})
