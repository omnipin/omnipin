import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import {
  type EIP3770Address,
  getEip3770Address,
  parseEip3770Address,
} from '../../../src/utils/safe/eip3770.js'

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as const

describe('safe/eip3770', () => {
  describe('parseEip3770Address', () => {
    it('returns the address with no prefix when none is given', () => {
      const r = parseEip3770Address(VITALIK)
      assert.deepStrictEqual(r, { prefix: '', address: VITALIK })
    })

    it('splits prefix:address and checksums the address', () => {
      const r = parseEip3770Address(
        `eth:${VITALIK.toLowerCase()}` as EIP3770Address,
      )
      assert.deepStrictEqual(r, { prefix: 'eth', address: VITALIK })
    })

    it('rejects inputs with more than one ":" separator', () => {
      assert.throws(
        () =>
          parseEip3770Address(
            `eth:${VITALIK}:extra` as unknown as EIP3770Address,
          ),
        /Invalid EIP-3770 address/,
      )
    })
  })

  describe('getEip3770Address', () => {
    it('accepts a matching prefix for the current chain', () => {
      const r = getEip3770Address({
        fullAddress: `eth:${VITALIK}` satisfies EIP3770Address,
        chainId: 1,
      })
      assert.deepStrictEqual(r, { prefix: 'eth', address: VITALIK })
    })

    it('rejects a prefix that does not match the current chain', () => {
      assert.throws(
        () =>
          getEip3770Address({
            fullAddress: `eth:${VITALIK}` satisfies EIP3770Address,
            chainId: 11155111,
          }),
        /network prefix must match the current network/,
      )
    })

    it('throws on a chainId outside the supported network list', () => {
      assert.throws(
        () =>
          getEip3770Address({
            fullAddress: `eth:${VITALIK}` satisfies EIP3770Address,
            chainId: 137,
          }),
        /No network prefix supported for the current chainId/,
      )
    })
  })
})
