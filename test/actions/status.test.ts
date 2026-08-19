import { afterEach, describe, expect, it } from 'bun:test'
import { statusAction } from '../../src/actions/status.js'
import { PROVIDERS } from '../../src/constants.js'
import { AllProvidersFailedError } from '../../src/errors.js'
import type { PinStatus } from '../../src/types.js'

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

const registered: string[] = []

const register = (
  key: string,
  name: string,
  status: () => Promise<{ pin: PinStatus }>,
) => {
  PROVIDERS[key] = {
    name,
    upload: async () => ({ cid: CID }),
    status,
    supported: 'both',
    protocol: 'ipfs',
  }
  registered.push(key)
  return name
}

afterEach(() => {
  for (const key of registered.splice(0)) delete PROVIDERS[key]
})

describe('status action', () => {
  it('reports the status of every provider', async () => {
    const a = register('TEST_A_TOKEN', 'TestA', async () => ({
      pin: 'pinned',
    }))
    const b = register('TEST_B_TOKEN', 'TestB', async () => ({
      pin: 'queued',
    }))

    await expect(
      statusAction({ cid: CID, options: { providers: `${a},${b}` } }),
    ).resolves.toBeUndefined()
  })

  // Regression: `Promise.all` rejected on the first failing provider, so one
  // bad token or one 500 suppressed every other provider's status.
  it('keeps reporting when one provider fails', async () => {
    const ok = register('TEST_A_TOKEN', 'TestA', async () => ({
      pin: 'pinned',
    }))
    const bad = register('TEST_B_TOKEN', 'TestB', async () => {
      throw new Error('provider is down')
    })

    let reported: PinStatus | undefined
    register('TEST_C_TOKEN', 'TestC', async () => {
      reported = 'pinned'
      return { pin: 'pinned' }
    })

    await expect(
      statusAction({ cid: CID, options: { providers: `${ok},${bad},TestC` } }),
    ).resolves.toBeUndefined()

    // The provider listed after the failing one still ran.
    expect(reported).toEqual('pinned')
  })

  it('fails the run when every provider fails', async () => {
    const a = register('TEST_A_TOKEN', 'TestA', async () => {
      throw new Error('down')
    })
    const b = register('TEST_B_TOKEN', 'TestB', async () => {
      throw new Error('also down')
    })

    await expect(
      statusAction({ cid: CID, options: { providers: `${a},${b}` } }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError)
  })
})
