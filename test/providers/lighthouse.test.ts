/** biome-ignore-all lint/style/noNonNullAssertion: asserting env tokens */
import * as assert from 'node:assert'
import { describe, it } from 'node:test'

import { PROVIDERS } from '../../src/constants.js'
import { unpinOnLighthouse } from '../../src/providers/ipfs/lighthouse.js'

const { upload: uploadOnLighthouse } = PROVIDERS.LIGHTHOUSE_TOKEN
const _hasLighthouseToken = Boolean(process.env.OMNIPIN_LIGHTHOUSE_TOKEN)

describe('Lighthouse', () => {
  describe('upload', () => {
    it.skip('uploads a CAR file - SKIPPED: Lighthouse trial expired', {
      timeout: 30_000,
    }, async () => {
      // const token = process.env.OMNIPIN_LIGHTHOUSE_TOKEN
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
      // assert.strictEqual(cid, car.rootCID.toString())
    })
  })

  describe('pin', () => {
    it.skip('should pin a CID on Lighthouse successfully - SKIPPED: Lighthouse API issues', async () => {
      const token = process.env.OMNIPIN_LIGHTHOUSE_TOKEN!

      const cid = 'bafybeibvc3eg46ysr4k6vvuvpykarmk3eq2b3zdbdvaxahjwi47k3rnaom'

      const result = await uploadOnLighthouse({
        token,
        cid,
        name: 'Omnipin test',
        first: false,
        bytes: new Uint8Array(),
        size: 0,
      })

      assert.strictEqual(result.cid, cid)
      assert.strictEqual(result.status, 'queued')
    })
  })

  describe('unpin', () => {
    it('should throw if CID not found in uploads list', async () => {
      await assert.rejects(
        unpinOnLighthouse({
          token: 'bad-token',
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        }),
        /Failed to deploy on Lighthouse/,
      )
    })

    it.skip('should unpin an uploaded CID successfully', async () => {
      const token = process.env.OMNIPIN_LIGHTHOUSE_TOKEN!
      const cid = 'bafybeibvc3eg46ysr4k6vvuvpykarmk3eq2b3zdbdvaxahjwi47k3rnaom'

      const result = await unpinOnLighthouse({ token, cid })
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.cid, cid)
    })
  })
})
