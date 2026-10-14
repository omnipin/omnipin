import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deployAction } from '../../src/actions/deploy.js'
import { PROVIDERS } from '../../src/constants.js'
import { AllProvidersFailedError } from '../../src/errors.js'
import type {
  StatusFunction,
  SupportedMethods,
  UploadFunction,
} from '../../src/types.js'

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

let dir: string
const registered: string[] = []

const register = (
  key: string,
  name: string,
  protocol: 'ipfs' | 'swarm',
  upload: UploadFunction,
  extra: { status?: StatusFunction; supported?: SupportedMethods } = {},
) => {
  PROVIDERS[key] = {
    name,
    upload,
    status: extra.status,
    supported: extra.supported ?? 'both',
    protocol,
  }
  registered.push(key)
  return name
}

const succeeds: UploadFunction = async () => ({ cid: CID, rID: 'deadbeef' })
const fails: UploadFunction = async () => {
  throw new Error('provider is down')
}

const recording = () => {
  const calls: { first: boolean }[] = []
  const upload: UploadFunction = async ({ first }) => {
    calls.push({ first })
    return { cid: CID }
  }
  return { calls, upload }
}

const pinned: StatusFunction = async () => ({ pin: 'pinned' })
const notPinned: StatusFunction = async () => ({ pin: 'not pinned' })
const statusDown: StatusFunction = async () => {
  throw new Error('status endpoint down')
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'omnipin-deploy-test-'))
  await writeFile(join(dir, 'index.html'), '<!doctype html>hello')
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

afterEach(() => {
  for (const key of registered.splice(0)) delete PROVIDERS[key]
})

describe('deploy action', () => {
  // Regression: the all-failed check compared the error count against
  // `ipfsProviders.length` even on the Swarm path. Swarm and IPFS are never
  // deployed together, but IPFS tokens still sit in the environment and were
  // still counted — so an unused IPFS provider could turn a partial Swarm
  // success into AllProvidersFailedError.
  it('does not fail the run when an unused IPFS provider matches the error count', async () => {
    const ipfs = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', succeeds)
    const down = register('TEST_SWARM_A_TOKEN', 'TestSwarmA', 'swarm', fails)
    const up = register('TEST_SWARM_B_TOKEN', 'TestSwarmB', 'swarm', succeeds)

    // One of two Swarm providers fails, and exactly one IPFS provider is
    // configured but never deployed to.
    await expect(
      deployAction({ dir, options: { providers: `${ipfs},${down},${up}` } }),
    ).resolves.toBeUndefined()
  })

  it('still fails when every Swarm provider fails', async () => {
    const ipfs = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', succeeds)
    const a = register('TEST_SWARM_A_TOKEN', 'TestSwarmA', 'swarm', fails)
    const b = register('TEST_SWARM_B_TOKEN', 'TestSwarmB', 'swarm', fails)

    await expect(
      deployAction({ dir, options: { providers: `${ipfs},${a},${b}` } }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError)
  })

  it('still fails when every IPFS provider fails', async () => {
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', fails)
    const b = register('TEST_IPFS_B_TOKEN', 'TestIpfsB', 'ipfs', fails)

    await expect(
      deployAction({ dir, options: { providers: `${a},${b}` } }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError)
  })

  it('resolves when a single IPFS provider succeeds', async () => {
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', succeeds)

    await expect(
      deployAction({ dir, options: { providers: a } }),
    ).resolves.toBeUndefined()
  })

  it('rethrows immediately under --strict', async () => {
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', fails)
    const b = register('TEST_IPFS_B_TOKEN', 'TestIpfsB', 'ipfs', succeeds)

    await expect(
      deployAction({ dir, options: { providers: `${a},${b}`, strict: true } }),
    ).rejects.toThrow('provider is down')
  })
})

describe('deploy action with --skip-pinned', () => {
  it('skips a provider that already pins the CID and deploys to the rest', async () => {
    const aRec = recording()
    const bRec = recording()
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', aRec.upload, {
      status: pinned,
    })
    const b = register('TEST_IPFS_B_TOKEN', 'TestIpfsB', 'ipfs', bRec.upload, {
      status: notPinned,
    })

    await expect(
      deployAction({
        dir,
        options: { providers: `${a},${b}`, 'skip-pinned': true },
      }),
    ).resolves.toBeUndefined()
    expect(aRec.calls.length).toBe(0)
    expect(bRec.calls.length).toBe(1)
  })

  it('uploads when the status is not pinned', async () => {
    const rec = recording()
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', rec.upload, {
      status: notPinned,
    })

    await expect(
      deployAction({ dir, options: { providers: a, 'skip-pinned': true } }),
    ).resolves.toBeUndefined()
    expect(rec.calls).toEqual([{ first: true }])
  })

  it('deploys anyway when the status check throws, even under --strict', async () => {
    const rec = recording()
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', rec.upload, {
      status: statusDown,
    })

    // A leaked status error would either reject via --strict or, with a
    // single provider, match the error count and throw
    // AllProvidersFailedError.
    await expect(
      deployAction({
        dir,
        options: { providers: a, 'skip-pinned': true, strict: true },
      }),
    ).resolves.toBeUndefined()
    expect(rec.calls.length).toBe(1)
  })

  it('hands the byte upload to the next provider when the uploader is skipped', async () => {
    const bRec = recording()
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', succeeds, {
      status: pinned,
    })
    const b = register('TEST_IPFS_B_TOKEN', 'TestIpfsB', 'ipfs', bRec.upload)

    await expect(
      deployAction({
        dir,
        options: { providers: `${a},${b}`, 'skip-pinned': true },
      }),
    ).resolves.toBeUndefined()
    expect(bRec.calls).toEqual([{ first: true }])
  })

  it('gives pin-only providers first: false when every uploader is skipped', async () => {
    const bRec = recording()
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', succeeds, {
      status: pinned,
    })
    const b = register('TEST_IPFS_B_TOKEN', 'TestIpfsB', 'ipfs', bRec.upload, {
      supported: 'pin',
    })

    await expect(
      deployAction({
        dir,
        options: { providers: `${a},${b}`, 'skip-pinned': true },
      }),
    ).resolves.toBeUndefined()
    expect(bRec.calls).toEqual([{ first: false }])
  })

  it('succeeds without uploads when every provider already pins the CID', async () => {
    const aRec = recording()
    const bRec = recording()
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', aRec.upload, {
      status: pinned,
    })
    const b = register('TEST_IPFS_B_TOKEN', 'TestIpfsB', 'ipfs', bRec.upload, {
      status: pinned,
    })

    await expect(
      deployAction({
        dir,
        options: { providers: `${a},${b}`, 'skip-pinned': true },
      }),
    ).resolves.toBeUndefined()
    expect(aRec.calls.length).toBe(0)
    expect(bRec.calls.length).toBe(0)
  })

  it('still fails when every attempted provider fails', async () => {
    // 3 active providers, 1 skipped, 2 errors: the old check compared the
    // error count against all active providers and would not throw here.
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', succeeds, {
      status: pinned,
    })
    const b = register('TEST_IPFS_B_TOKEN', 'TestIpfsB', 'ipfs', fails)
    const c = register('TEST_IPFS_C_TOKEN', 'TestIpfsC', 'ipfs', fails)

    await expect(
      deployAction({
        dir,
        options: { providers: `${a},${b},${c}`, 'skip-pinned': true },
      }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError)
  })

  it('never calls status when the flag is off', async () => {
    let statusCalled = false
    const aRec = recording()
    const bRec = recording()
    const spy: StatusFunction = async () => {
      statusCalled = true
      return { pin: 'pinned' }
    }
    const a = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', aRec.upload, {
      status: spy,
    })
    const b = register('TEST_IPFS_B_TOKEN', 'TestIpfsB', 'ipfs', bRec.upload, {
      status: spy,
    })

    await expect(
      deployAction({ dir, options: { providers: `${a},${b}` } }),
    ).resolves.toBeUndefined()
    expect(statusCalled).toBe(false)
    expect(aRec.calls).toEqual([{ first: true }])
    expect(bRec.calls).toEqual([{ first: false }])
  })

  it('ignores the flag on Swarm deploys', async () => {
    let statusCalled = false
    const spy: StatusFunction = async () => {
      statusCalled = true
      return { pin: 'pinned' }
    }
    const ipfs = register('TEST_IPFS_TOKEN', 'TestIpfs', 'ipfs', succeeds, {
      status: spy,
    })
    const swarm = register('TEST_SWARM_TOKEN', 'TestSwarm', 'swarm', succeeds)

    await expect(
      deployAction({
        dir,
        options: { providers: `${ipfs},${swarm}`, 'skip-pinned': true },
      }),
    ).resolves.toBeUndefined()
    expect(statusCalled).toBe(false)
  })
})
