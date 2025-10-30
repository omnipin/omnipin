import { describe, expect, it } from 'bun:test'
import { UploadNotSupportedError } from '../../src/errors'
import { pinOnLighthouse } from '../../src/providers/ipfs/lighthouse'

describe('Lighthouse', () => {
  describe('pin', () => {
    it('should throw if pinning was chosen as a first provider', () => {
      expect(
        // @ts-expect-error only checking if it throws by passing `first`
        pinOnLighthouse({ first: true, providerName: 'Test' }),
      ).rejects.toThrowError(new UploadNotSupportedError('Lighthouse'))
    })
    it.skip('should pin a CID on Lighthouse successfully', async () => {
      const token = Bun.env.BLUMEN_LIGHTHOUSE_TOKEN

      if (!token) throw new Error('Missing Lighthouse token')

      const cid = 'bafybeibvc3eg46ysr4k6vvuvpykarmk3eq2b3zdbdvaxahjwi47k3rnaom'

      const result = await pinOnLighthouse({
        token,
        cid,
        name: 'Omnipin test',
      })

      expect(result.cid).toEqual(cid)
    })
  })
})
