import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { addressFromPrivateKey, ZERO_ADDRESS } from '../../src/utils/address.js'

describe('address utils', () => {
  describe('addressFromPrivateKey', () => {
    it('derives the address of a known key', () => {
      // The canonical secp256k1 test vector: private key 0x01 belongs to
      // 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf.
      assert.strictEqual(
        addressFromPrivateKey(`0x${'00'.repeat(31)}01`),
        '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf',
      )
    })

    it('accepts a key without the 0x prefix', () => {
      const key = `${'00'.repeat(31)}01`
      assert.strictEqual(
        addressFromPrivateKey(key),
        addressFromPrivateKey(`0x${key}`),
      )
    })

    it('returns undefined for an invalid key', () => {
      assert.strictEqual(addressFromPrivateKey('0xnothex'), undefined)
      assert.strictEqual(addressFromPrivateKey('0xdeadbeef'), undefined)
      assert.strictEqual(addressFromPrivateKey(''), undefined)
    })
  })

  describe('ZERO_ADDRESS', () => {
    it('is the 20-byte zero address', () => {
      assert.strictEqual(
        ZERO_ADDRESS,
        '0x0000000000000000000000000000000000000000',
      )
    })
  })
})
