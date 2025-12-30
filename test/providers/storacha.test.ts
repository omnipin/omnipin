/** biome-ignore-all lint/style/noNonNullAssertion: asserting env tokens */
import { describe, expect, it } from 'bun:test'
import { MissingKeyError } from '../../src/errors.js'
import { uploadOnStoracha } from '../../src/providers/ipfs/storacha.js'
import { walk } from '../../src/utils/fs.js'
import { packCAR } from '../../src/utils/ipfs.js'

describe('Storacha provider', () => {
  describe('upload', () => {
    it('should throw if STORACHA_PROOF is missing', () => {
      // biome-ignore lint/suspicious/noExplicitAny: test
      expect(uploadOnStoracha({ proof: '' } as any)).rejects.toThrowError(
        new MissingKeyError('STORACHA_PROOF'),
      )
    })
    it(
      'uploads a file',
      async () => {
        const [size, files] = await walk('./dist', false)
        const car = await packCAR(files, 'test.car')

        const { cid } = await uploadOnStoracha({
          proof: process.env.OMNIPIN_STORACHA_PROOF!,
          token: process.env.OMNIPIN_STORACHA_TOKEN!,
          name: 'test',
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
})
