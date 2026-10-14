import * as assert from 'node:assert'
import { describe, it } from 'node:test'

import { PROVIDERS } from '../../src/constants.js'
import { packCAR, walk } from '../../src/index.js'
import {
  statusOnFula,
  unpinOnFula,
  uploadOnFula,
} from '../../src/providers/ipfs/fula.js'

const { upload, status, unpin } = PROVIDERS.FULA_TOKEN
const token = process.env.OMNIPIN_FULA_TOKEN!
const hasToken = Boolean(token)

describe('Fula', () => {
  // CID uploaded by the `upload` test and reused by `pin` / `unpin`. The
  // `unpin` test removes it at the end, so the suite cleans up after itself.
  let uploadedCid = ''

  it('is registered in PROVIDERS with upload, status, and unpin', () => {
    assert.strictEqual(upload, uploadOnFula)
    assert.strictEqual(status, statusOnFula)
    assert.strictEqual(unpin, unpinOnFula)
    assert.strictEqual(PROVIDERS.FULA_TOKEN.supported, 'both')
    assert.strictEqual(PROVIDERS.FULA_TOKEN.protocol, 'ipfs')
    assert.strictEqual(PROVIDERS.FULA_TOKEN.name, 'Fula')
  })

  describe('status', () => {
    it('returns "not pinned" for an unknown CID', {
      skip: !hasToken,
      timeout: 15_000,
    }, async () => {
      const result = await statusOnFula({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdq',
        auth: { token },
      })
      assert.strictEqual(result.pin, 'not pinned')
    })
  })

  describe('upload', () => {
    it('imports a CAR and preserves the root CID', {
      skip: !hasToken,
      timeout: 60_000,
    }, async () => {
      const [size, files] = await walk('./dist', false)
      const car = await packCAR(files, 'test')

      const { cid } = await uploadOnFula({
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
    it('re-pins the uploaded CID via the standard /pins endpoint', {
      skip: !hasToken,
      timeout: 30_000,
    }, async () => {
      assert.notStrictEqual(uploadedCid, '')

      const result = await uploadOnFula({
        token,
        cid: uploadedCid,
        name: 'omnipin pin test',
        first: false,
        bytes: new Uint8Array(),
        size: 0,
      })

      assert.strictEqual(result.cid, uploadedCid)
    })
  })

  describe('unpin', () => {
    it('unpins the uploaded CID, cleaning up the upload', {
      skip: !hasToken,
      timeout: 15_000,
    }, async () => {
      assert.notStrictEqual(uploadedCid, '')

      const result = await unpinOnFula({ token, cid: uploadedCid })
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.cid, uploadedCid)
    })
  })
})
