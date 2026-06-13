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
  // CID uploaded by the `upload` test and reused by `pin` / `unpin`. The
  // `unpin` test removes it at the end, so the suite cleans up after itself
  // and doesn't slowly fill the account up to its pin limit — no separate
  // cleanup step needed.
  let uploadedCid = ''

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
        uploadedCid = cid
      },
      { timeout: 60_000 },
    )
  })

  describe('pin', () => {
    it(
      're-pins the uploaded CID via the /pin endpoint',
      async () => {
        // Re-pinning a CID already on the account is a dedupe no-op
        // (`deduped: true`). The /pin endpoint needs a dag-pb CID (Qm/bafy),
        // which the uploaded root CID is.
        expect(uploadedCid).not.toBe('')

        const result = await uploadOnIpfsNinja({
          token,
          cid: uploadedCid,
          name: 'omnipin pin test',
          first: false,
          bytes: new Uint8Array(),
          size: 0,
        })

        expect(result.cid).toBe(uploadedCid)
        expect(result.status).toBe('queued')
      },
      { timeout: 30_000 },
    )
  })

  describe('unpin', () => {
    it(
      'unpins the uploaded CID via DELETE /pin/{cid}, cleaning up the upload',
      async () => {
        expect(uploadedCid).not.toBe('')

        const result = await unpinOnIpfsNinja({ token, cid: uploadedCid })
        expect(result.success).toBe(true)
        expect(result.cid).toBe(uploadedCid)
      },
      { timeout: 15_000 },
    )
  })
})
