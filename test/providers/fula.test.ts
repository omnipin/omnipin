import { describe, expect, it } from 'bun:test'

import { PROVIDERS } from '../../src/constants.js'
import { packCAR, walk } from '../../src/index.js'
import {
  statusOnFula,
  unpinOnFula,
  uploadOnFula,
} from '../../src/providers/ipfs/fula.js'

const { upload, status, unpin } = PROVIDERS.FULA_TOKEN
const token = Bun.env.OMNIPIN_FULA_TOKEN!
const hasToken = Boolean(token)

describe('Fula', () => {
  // CID uploaded by the `upload` test and reused by `pin` / `unpin`. The
  // `unpin` test removes it at the end, so the suite cleans up after itself.
  let uploadedCid = ''

  it('is registered in PROVIDERS with upload, status, and unpin', () => {
    expect(upload).toBe(uploadOnFula)
    expect(status).toBe(statusOnFula)
    expect(unpin).toBe(unpinOnFula)
    expect(PROVIDERS.FULA_TOKEN.supported).toBe('both')
    expect(PROVIDERS.FULA_TOKEN.protocol).toBe('ipfs')
    expect(PROVIDERS.FULA_TOKEN.name).toBe('Fula')
  })

  describe('status', () => {
    it.skipIf(!hasToken)(
      'returns "not pinned" for an unknown CID',
      async () => {
        const result = await statusOnFula({
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdq',
          auth: { token },
        })
        expect(result.pin).toBe('not pinned')
      },
      { timeout: 15_000 },
    )
  })

  describe('upload', () => {
    it.skipIf(!hasToken)(
      'imports a CAR and preserves the root CID',
      async () => {
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

        expect(cid).toBe(car.rootCID.toString())
        uploadedCid = cid
      },
      { timeout: 60_000 },
    )
  })

  describe('pin', () => {
    it.skipIf(!hasToken)(
      're-pins the uploaded CID via the standard /pins endpoint',
      async () => {
        expect(uploadedCid).not.toBe('')

        const result = await uploadOnFula({
          token,
          cid: uploadedCid,
          name: 'omnipin pin test',
          first: false,
          bytes: new Uint8Array(),
          size: 0,
        })

        expect(result.cid).toBe(uploadedCid)
      },
      { timeout: 30_000 },
    )
  })

  describe('unpin', () => {
    it.skipIf(!hasToken)(
      'unpins the uploaded CID, cleaning up the upload',
      async () => {
        expect(uploadedCid).not.toBe('')

        const result = await unpinOnFula({ token, cid: uploadedCid })
        expect(result.success).toBe(true)
        expect(result.cid).toBe(uploadedCid)
      },
      { timeout: 15_000 },
    )
  })
})
