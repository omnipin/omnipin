import { describe, expect, it } from 'bun:test'
import { UploadNotSupportedError } from '../../src/errors.js'
import { pinOnAioz } from '../../src/providers/ipfs/aioz.js'

const hasAiozToken = Boolean(Bun.env.OMNIPIN_AIOZ_TOKEN)

describe('AIOZ', () => {
  describe('pin', () => {
    it('should throw if pinning was chosen as a first provider', async () => {
      await expect(
        pinOnAioz({
          first: true,
          token: 'key:secret',
          cid: 'QmTest',
          name: 'test',
          car: new Blob(),
          size: 0,
        }),
      ).rejects.toThrow(UploadNotSupportedError)
    })

    it('should throw if token format is invalid', async () => {
      await expect(
        pinOnAioz({
          first: false,
          token: 'onlykey',
          cid: 'QmTest',
          name: 'test',
          car: new Blob(),
          size: 0,
        }),
      ).rejects.toThrow('Invalid token format')
    })

    it.skipIf(!hasAiozToken)(
      'should pin a CID on AIOZ successfully',
      async () => {
        const token = Bun.env.OMNIPIN_AIOZ_TOKEN!

        const cid =
          'bafybeibvc3eg46ysr4k6vvuvpykarmk3eq2b3zdbdvaxahjwi47k3rnaom'

        try {
          const result = await pinOnAioz({
            first: false,
            token,
            cid,
            name: 'Omnipin test',
            car: new Blob(),
            size: 0,
          })

          expect(result.cid).toEqual(cid)
        } catch (e: any) {
          if (e.message?.includes('not enough balance')) {
            console.log('⚠️  Skipping: AIOZ account has no balance')
            return
          }
          throw e
        }
      },
      { timeout: 30_000 },
    )
  })
})
