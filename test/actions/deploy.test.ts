import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deployAction } from '../../src/actions/deploy.js'
import { PROVIDERS } from '../../src/constants.js'
import { AllProvidersFailedError } from '../../src/errors.js'
import type { UploadFunction } from '../../src/types.js'

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

let dir: string
const registered: string[] = []

const register = (
  key: string,
  name: string,
  protocol: 'ipfs' | 'swarm',
  upload: UploadFunction,
) => {
  PROVIDERS[key] = { name, upload, supported: 'both', protocol }
  registered.push(key)
  return name
}

const succeeds: UploadFunction = async () => ({ cid: CID, rID: 'deadbeef' })
const fails: UploadFunction = async () => {
  throw new Error('provider is down')
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
