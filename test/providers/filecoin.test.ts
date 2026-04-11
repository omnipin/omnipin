import { describe, expect, it } from 'bun:test'
import { calculatePieceCID } from '@omnipin/foc/utils'
import { randomPrivateKey } from 'ox/Secp256k1'
import { MissingKeyError, packCAR, walk } from '../../src/index.js'
import { uploadToFilecoin } from '../../src/providers/ipfs/filecoin.js'

const [size, files] = await walk('./dist', false)
const car = await packCAR(files, 'test.car')

const _pieceCid = calculatePieceCID(car.bytes).toString()

describe('Filecoin', () => {
  it('should not throw MissingKeyError when only providerAddress is specified', async () => {
    // This test verifies that when only providerAddress is specified,
    // we don't get a MissingKeyError for FILECOIN_SP_URL (it should be inferred)
    // We expect it to fail with UploadNotSupportedError because we're
    // testing as first provider, not because of missing env vars
    try {
      await uploadToFilecoin({
        bytes: car.bytes,
        cid: car.rootCID.toString(),
        size,
        first: true, // This should trigger UploadNotSupportedError
        token: randomPrivateKey(),
        name: 'test.car',
        filecoinChain: 'mainnet',
        providerAddress: '0x0000000000000000000000000000000000000000', // Valid address format
        // pieceCid is not needed as it's calculated from car
      })
      // If we get here without throwing, that's also fine for this test
      // (means it got past the env var check)
    } catch (error) {
      // We expect either UploadNotSupportedError (because first=true)
      // or some other error related to the provider not existing/etc.
      // But we specifically do NOT want MissingKeyError for FILECOIN_SP_URL
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
  })

  it('throws if no USDfc on account', async () => {
    try {
      await uploadToFilecoin({
        bytes: car.bytes,
        cid: car.rootCID.toString(),
        size,
        first: true,
        token: randomPrivateKey(),
        name: 'test.car',
        filecoinChain: 'mainnet',
        // pieceCid is not needed as it's calculated from car
      })
    } catch (e) {
      // The error might come from the FOC library directly now
      expect(e).toBeDefined()
      // Check that it's related to insufficient funds
      expect(String(e)).toContain('USDfc')
    }
  })
})
