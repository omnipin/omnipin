/** biome-ignore-all lint/style/noNonNullAssertion: asserting env tokens */
import { describe, expect, it } from 'bun:test'

import { PROVIDERS } from '../../src/constants.js'
import { unpinOnLighthouse } from '../../src/providers/ipfs/lighthouse.js'

const { upload: uploadOnLighthouse } = PROVIDERS.LIGHTHOUSE_TOKEN
const _hasLighthouseToken = Boolean(Bun.env.OMNIPIN_LIGHTHOUSE_TOKEN)

describe('Lighthouse', () => {
  describe('upload', () => {
    it.skip(
      'uploads a CAR file - SKIPPED: Lighthouse trial expired',
      async () => {
        // const token = Bun.env.OMNIPIN_LIGHTHOUSE_TOKEN
        // if (!token) throw new Error('Missing Lighthouse token')
        // const [size, files] = await walk('./dist', false)
        // const car = await packCAR(files, 'test.car')
        // const { cid } = await uploadOnLighthouse({
        //   token,
        //   name: 'omnipin-test',
        //   first: true,
        //   car: car.blob,
        //   cid: car.rootCID.toString(),
        //   size,
        // })
        // expect(cid).toEqual(car.rootCID.toString())
      },
      { timeout: 30_000 },
    )
  })

  describe('pin', () => {
    it.skip('should pin a CID on Lighthouse successfully - SKIPPED: Lighthouse API issues', async () => {
      const token = Bun.env.OMNIPIN_LIGHTHOUSE_TOKEN!

      const cid = 'bafybeibvc3eg46ysr4k6vvuvpykarmk3eq2b3zdbdvaxahjwi47k3rnaom'

      const result = await uploadOnLighthouse({
        token,
        cid,
        name: 'Omnipin test',
        first: false,
        bytes: new Uint8Array(),
        size: 0,
      })

      expect(result.cid).toEqual(cid)
      expect(result.status).toEqual('queued')
    })
  })

  describe('unpin', () => {
    it('should throw if CID not found in uploads list', async () => {
      await expect(
        unpinOnLighthouse({
          token: 'bad-token',
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        }),
      ).rejects.toThrow('Failed to deploy on Lighthouse')
    })

    it.skip('should unpin an uploaded CID successfully', async () => {
      const token = Bun.env.OMNIPIN_LIGHTHOUSE_TOKEN!
      const cid = 'bafybeibvc3eg46ysr4k6vvuvpykarmk3eq2b3zdbdvaxahjwi47k3rnaom'

      const result = await unpinOnLighthouse({ token, cid })
      expect(result.success).toBe(true)
      expect(result.cid).toBe(cid)
    })
  })
})
