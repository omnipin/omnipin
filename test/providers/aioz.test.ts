import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { UploadNotSupportedError } from '../../src/errors.js'
import { pinOnAioz } from '../../src/providers/ipfs/aioz.js'

describe('AIOZ', () => {
  describe('pin', () => {
    it('should throw if pinning was chosen as a first provider', async () => {
      await assert.rejects(
        pinOnAioz({
          first: true,
          token: 'key:secret',
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdq',
          name: 'test',
          bytes: new Uint8Array(),
          size: 0,
        }),
        UploadNotSupportedError,
      )
    })

    it('should throw if token format is invalid', async () => {
      await assert.rejects(
        pinOnAioz({
          first: false,
          token: 'onlykey',
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdq',
          name: 'test',
          bytes: new Uint8Array(),
          size: 0,
        }),
        /Invalid token format/,
      )
    })

    it('should pin a CID on AIOZ successfully', {
      timeout: 30_000,
    }, async () => {
      const token = process.env.OMNIPIN_AIOZ_TOKEN!
      const cid = 'bafybeibvc3eg46ysr4k6vvuvpykarmk3eq2b3zdbdvaxahjwi47k3rnaom'

      try {
        const result = await pinOnAioz({
          first: false,
          token,
          cid,
          name: 'Omnipin test',
          bytes: new Uint8Array(),
          size: 0,
        })

        assert.strictEqual(result.cid, cid)
      } catch (e) {
        if (
          e instanceof Error &&
          (e.message?.includes('already exists') ||
            e.message?.includes('not enough balance'))
        ) {
          console.log(`Skipping: AIOZ ${e.message}`)
          return
        }
        throw e
      }
    })
  })
})
