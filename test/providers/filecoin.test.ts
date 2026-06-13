import { describe, it } from 'bun:test'
import { randomPrivateKey } from 'ox/Secp256k1'
import { MissingKeyError, packCAR, walk } from '../../src/index.js'
import { uploadToFilecoin } from '../../src/providers/ipfs/filecoin.js'

const [size, files] = await walk('./dist', false)
const car = await packCAR(files, 'test.car')

describe('Filecoin', () => {
  it(
    'should not throw MissingKeyError when only providerAddress is specified',
    async () => {
      // This test verifies that when only providerAddress is specified,
      // we don't get a MissingKeyError for FILECOIN_SP_URL (it should be inferred).
      // Any other error is acceptable (random key has no USDfc, no real SP, etc.).
      try {
        await uploadToFilecoin({
          bytes: car.bytes,
          cid: car.rootCID.toString(),
          size,
          first: true,
          token: randomPrivateKey(),
          name: 'test.car',
          filecoinChain: 'mainnet',
          providerAddress: '0x0000000000000000000000000000000000000000',
        })
      } catch (error) {
        if (
          error instanceof MissingKeyError &&
          error.message.includes('FILECOIN_SP_URL')
        ) {
          throw new Error(
            'Test failed: Should not throw MissingKeyError for FILECOIN_SP_URL when providerAddress is specified',
          )
        }
        // Other errors are OK for this test
      }
    },
    { timeout: 120_000 },
  )
})
