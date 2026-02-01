/** biome-ignore-all lint/style/noNonNullAssertion: asserting env tokens */
import { describe, expect, it } from 'bun:test'
import { uploadOnLighthouse } from '../../src/providers/ipfs/lighthouse.js'
import { walk } from '../../src/utils/fs.js'
import { packCAR } from '../../src/utils/ipfs.js'

describe('Lighthouse', () => {
  describe('upload', () => {
    it.skip(
      'uploads a CAR file',
      async () => {
        const token = Bun.env.OMNIPIN_LIGHTHOUSE_TOKEN

        if (!token) throw new Error('Missing Lighthouse token')

        const [size, files] = await walk('./dist', false)
        const car = await packCAR(files, 'test.car')

        const { cid } = await uploadOnLighthouse({
          token,
          name: 'omnipin-test',
          first: true,
          car: car.blob,
          cid: car.rootCID.toString(),
          size,
        })

        expect(cid).toEqual(car.rootCID.toString())
      },
      { timeout: 30_000 },
    )
  })

  describe('pin', () => {
    it.skip('should pin a CID on Lighthouse successfully', async () => {
      const token = Bun.env.OMNIPIN_LIGHTHOUSE_TOKEN

      if (!token) throw new Error('Missing Lighthouse token')

      const cid = 'bafybeibvc3eg46ysr4k6vvuvpykarmk3eq2b3zdbdvaxahjwi47k3rnaom'

      const result = await uploadOnLighthouse({
        token,
        cid,
        name: 'Omnipin test',
        first: false,
        car: new Blob(),
        size: 0,
      })

      expect(result.cid).toEqual(cid)
    })
  })
})
