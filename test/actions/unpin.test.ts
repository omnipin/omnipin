import { afterEach, describe, expect, it } from 'bun:test'
import { unpinAction } from '../../src/actions/unpin.js'
import { PROVIDERS } from '../../src/constants.js'
import { AllProvidersFailedError } from '../../src/errors.js'

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

const registered: string[] = []

/**
 * Add a throwaway provider to the registry. Selection goes through
 * `--providers` so the run is driven by the test's list rather than by
 * whatever OMNIPIN_* tokens happen to be in the developer's environment.
 */
const register = (
  key: string,
  name: string,
  unpin: () => Promise<{ success: boolean; cid: string }>,
) => {
  PROVIDERS[key] = {
    name,
    upload: async () => ({ cid: CID }),
    unpin,
    supported: 'both',
    protocol: 'ipfs',
  }
  registered.push(key)
  return name
}

afterEach(() => {
  for (const key of registered.splice(0)) delete PROVIDERS[key]
})

describe('unpin action', () => {
  it('resolves when the provider confirms the pin was removed', async () => {
    const name = register('TEST_OK_TOKEN', 'TestOk', async () => ({
      success: true,
      cid: CID,
    }))

    await expect(
      unpinAction({ cid: CID, options: { providers: name } }),
    ).resolves.toBeUndefined()
  })

  // Regression: the `{ success }` return was discarded, so a provider that
  // resolves with `success: false` (Blockfrost does this instead of throwing)
  // was reported as "Unpinned on X" and counted as a success.
  it('treats a resolved success:false as a failure', async () => {
    const name = register('TEST_FALSE_TOKEN', 'TestFalse', async () => ({
      success: false,
      cid: CID,
    }))

    await expect(
      unpinAction({ cid: CID, options: { providers: name } }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError)
  })

  it('does not fail the run when only some providers report failure', async () => {
    const ok = register('TEST_OK_TOKEN', 'TestOk', async () => ({
      success: true,
      cid: CID,
    }))
    const bad = register('TEST_FALSE_TOKEN', 'TestFalse', async () => ({
      success: false,
      cid: CID,
    }))

    await expect(
      unpinAction({ cid: CID, options: { providers: `${ok},${bad}` } }),
    ).resolves.toBeUndefined()
  })

  it('still aggregates providers that throw', async () => {
    const name = register('TEST_THROW_TOKEN', 'TestThrow', async () => {
      throw new Error('boom')
    })

    await expect(
      unpinAction({ cid: CID, options: { providers: name } }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError)
  })
})
