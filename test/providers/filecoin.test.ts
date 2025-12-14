import { describe, expect, it } from 'bun:test'
import { randomPrivateKey } from 'ox/Secp256k1'
import { DeployError, MissingKeyError, packCAR, walk } from '../../src/index.js'
import { uploadToFilecoin } from '../../src/providers/ipfs/filecoin.js'
import { calculatePieceCID } from '../../src/utils/filecoin/calculatePieceCID.js'

const [size, files] = await walk('./dist', false)
const car = await packCAR(files, 'test.car')

const carBytes = new Uint8Array(await car.blob.arrayBuffer())
const pieceCid = calculatePieceCID(carBytes).toString()

describe('Filecoin', () => {
  it('throws if one env variable is specified but the other is not', async () => {
    try {
      await uploadToFilecoin({
        car: car.blob,
        cid: car.rootCID.toString(),
        size,
        first: true,
        pieceCid,
        token: '0x',
        name: 'test.car',
        filecoinChain: 'mainnet',
        providerAddress: '0x',
      })
    } catch (e) {
      expect(e as MissingKeyError).toEqual(
        new MissingKeyError('FILECOIN_SP_URL'),
      )
    }
  })
  it('throws if no USDfc on account', async () => {
    try {
      await uploadToFilecoin({
        car: car.blob,
        cid: car.rootCID.toString(),
        size,
        first: true,
        pieceCid,
        token: randomPrivateKey(),
        name: 'test.car',
        filecoinChain: 'mainnet',
      })
    } catch (e) {
      expect(e as DeployError).toEqual(
        new DeployError('Filecoin', 'No USDfc on account'),
      )
    }
  })
})
