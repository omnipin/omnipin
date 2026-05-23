import { describe, expect, it } from 'bun:test'

import { PROVIDERS } from '../../src/constants.js'
import { packCAR, walk } from '../../src/index.js'
import {
  statusOnIpfsNinja,
  unpinOnIpfsNinja,
  uploadOnIpfsNinja,
} from '../../src/providers/ipfs/ipfs-ninja.js'

const { upload, status } = PROVIDERS.IPFS_NINJA_TOKEN
const { unpin } = PROVIDERS.IPFS_NINJA_TOKEN
const token = Bun.env.OMNIPIN_IPFS_NINJA_TOKEN!

describe('IPFSNinja', () => {
  it('is registered in PROVIDERS with upload, status, and unpin', () => {
    expect(upload).toBe(uploadOnIpfsNinja)
    expect(status).toBe(statusOnIpfsNinja)
    expect(unpin).toBe(unpinOnIpfsNinja)
    expect(PROVIDERS.IPFS_NINJA_TOKEN.supported).toBe('both')
    expect(PROVIDERS.IPFS_NINJA_TOKEN.protocol).toBe('ipfs')
    expect(PROVIDERS.IPFS_NINJA_TOKEN.name).toBe('IPFSNinja')
  })

  describe('status', () => {
    it(
      'returns "not pinned" for an unknown CID',
      async () => {
        const result = await statusOnIpfsNinja({
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdq',
          auth: { token },
        })
        expect(result.pin).toBe('not pinned')
      },
      { timeout: 15_000 },
    )
  })

  describe('upload', () => {
    it(
      'uploads a CAR and preserves the root CID',
      async () => {
        const [size, files] = await walk('./dist', false)
        const car = await packCAR(files, 'test')

        const { cid } = await uploadOnIpfsNinja({
          token,
          name: `omnipin-test-${Date.now()}`,
          first: true,
          bytes: car.bytes,
          cid: car.rootCID.toString(),
          size,
        })

        expect(cid).toBe(car.rootCID.toString())
      },
      { timeout: 60_000 },
    )
  })

  describe('pin', () => {
    it(
      're-pins an existing CID via the /pin endpoint',
      async () => {
        // ipfs.ninja's /pin endpoint requires CIDs that start with Qm or bafy
        // (dag-pb). This is a CID we previously uploaded from the omnipin
        // smoke test, so re-pinning is a no-op (`deduped: true`).
        const cid =
          'bafybeiehlvkyfqt3wpfof27bcrhb4wklk7nwouadp7rq5djos2avoaciu4'

        const result = await uploadOnIpfsNinja({
          token,
          cid,
          name: 'omnipin pin test',
          first: false,
          bytes: new Uint8Array(),
          size: 0,
        })

        expect(result.cid).toBe(cid)
        expect(result.status).toBe('queued')
      },
      { timeout: 30_000 },
    )
  })

  describe('unpin', () => {
    it(
      'should unpin a CID via DELETE /pin/{cid}',
      async () => {
        const cid =
          'bafybeiehlvkyfqt3wpfof27bcrhb4wklk7nwouadp7rq5djos2avoaciu4'

        const result = await unpinOnIpfsNinja({ token, cid })
        expect(result.success).toBe(true)
        expect(result.cid).toBe(cid)
      },
      { timeout: 15_000 },
    )
  })
})
