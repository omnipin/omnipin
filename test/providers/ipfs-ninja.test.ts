import * as assert from 'node:assert'
import { describe, it } from 'node:test'

import { PROVIDERS } from '../../src/constants.js'
import { packCAR, walk } from '../../src/index.js'
import {
  statusOnIpfsNinja,
  unpinOnIpfsNinja,
  uploadOnIpfsNinja,
} from '../../src/providers/ipfs/ipfs-ninja.js'

const { upload, status } = PROVIDERS.IPFS_NINJA_TOKEN
const { unpin } = PROVIDERS.IPFS_NINJA_TOKEN
const token = process.env.OMNIPIN_IPFS_NINJA_TOKEN!

describe('IPFSNinja', () => {
  // CID uploaded by the `upload` test and reused by `pin` / `unpin`. The
  // `unpin` test removes it at the end, so the suite cleans up after itself
  // and doesn't slowly fill the account up to its pin limit — no separate
  // cleanup step needed.
  let uploadedCid = ''

  it('is registered in PROVIDERS with upload, status, and unpin', () => {
    assert.strictEqual(upload, uploadOnIpfsNinja)
    assert.strictEqual(status, statusOnIpfsNinja)
    assert.strictEqual(unpin, unpinOnIpfsNinja)
    assert.strictEqual(PROVIDERS.IPFS_NINJA_TOKEN.supported, 'both')
    assert.strictEqual(PROVIDERS.IPFS_NINJA_TOKEN.protocol, 'ipfs')
    assert.strictEqual(PROVIDERS.IPFS_NINJA_TOKEN.name, 'IPFSNinja')
  })

  describe('status', () => {
    it('returns "not pinned" for an unknown CID', {
      timeout: 15_000,
    }, async () => {
      const result = await statusOnIpfsNinja({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdq',
        auth: { token },
      })
      assert.strictEqual(result.pin, 'not pinned')
    })
  })

  describe('upload', () => {
    it('uploads a CAR and preserves the root CID', {
      timeout: 60_000,
    }, async () => {
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

      assert.strictEqual(cid, car.rootCID.toString())
      uploadedCid = cid
    })
  })

  describe('pin', () => {
    it('re-pins the uploaded CID via the /pin endpoint', {
      timeout: 30_000,
    }, async () => {
      // Re-pinning a CID already on the account is a dedupe no-op
      // (`deduped: true`). The /pin endpoint needs a dag-pb CID (Qm/bafy),
      // which the uploaded root CID is.
      assert.notStrictEqual(uploadedCid, '')

      const result = await uploadOnIpfsNinja({
        token,
        cid: uploadedCid,
        name: 'omnipin pin test',
        first: false,
        bytes: new Uint8Array(),
        size: 0,
      })

      assert.strictEqual(result.cid, uploadedCid)
      assert.strictEqual(result.status, 'queued')
    })
  })

  describe('unpin', () => {
    it('unpins the uploaded CID via DELETE /pin/{cid}, cleaning up the upload', {
      timeout: 15_000,
    }, async () => {
      assert.notStrictEqual(uploadedCid, '')

      const result = await unpinOnIpfsNinja({ token, cid: uploadedCid })
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.cid, uploadedCid)
    })
  })
})
