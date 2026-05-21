import { describe, expect, it } from 'bun:test'
import {
  FILECOIN_USDFC,
  isSourceChainKey,
  resolveSourceToken,
  SOURCE_CHAINS,
} from '../../src/utils/filecoin-topup.js'
import { NATIVE_TOKEN } from '../../src/utils/squid.js'

describe('filecoin-topup utils', () => {
  describe('SOURCE_CHAINS', () => {
    it('contains the seven allow-listed chains', () => {
      expect(Object.keys(SOURCE_CHAINS).sort()).toEqual(
        ['arb', 'avalanche', 'base', 'bsc', 'eth', 'opt', 'polygon'].sort(),
      )
    })

    it('maps each chain to its canonical chain id', () => {
      expect(SOURCE_CHAINS.eth.id).toBe(1)
      expect(SOURCE_CHAINS.opt.id).toBe(10)
      expect(SOURCE_CHAINS.bsc.id).toBe(56)
      expect(SOURCE_CHAINS.polygon.id).toBe(137)
      expect(SOURCE_CHAINS.base.id).toBe(8453)
      expect(SOURCE_CHAINS.arb.id).toBe(42161)
      expect(SOURCE_CHAINS.avalanche.id).toBe(43114)
    })
  })

  describe('FILECOIN_USDFC', () => {
    it('is the canonical USDfc address on Filecoin', () => {
      expect(FILECOIN_USDFC.toLowerCase()).toBe(
        '0x80b98d3aa09ffff255c3ba4a241111ff1262f045',
      )
    })
  })

  describe('isSourceChainKey', () => {
    it('accepts every allow-listed chain', () => {
      for (const key of Object.keys(SOURCE_CHAINS)) {
        expect(isSourceChainKey(key)).toBe(true)
      }
    })

    it('rejects unknown chains', () => {
      expect(isSourceChainKey('fantom')).toBe(false)
      expect(isSourceChainKey('zksync')).toBe(false)
      expect(isSourceChainKey('eth ')).toBe(false)
      expect(isSourceChainKey(undefined)).toBe(false)
    })
  })

  describe('resolveSourceToken', () => {
    it('resolves a known symbol on the given chain', () => {
      expect(
        resolveSourceToken({ chain: 'arb', token: 'USDC' }).toLowerCase(),
      ).toBe('0xaf88d065e77c8cc2239327c5edb3a432268e5831')
    })

    it('resolves case-insensitively', () => {
      expect(
        resolveSourceToken({ chain: 'eth', token: 'usdc' }).toLowerCase(),
      ).toBe(SOURCE_CHAINS.eth.tokens.USDC.toLowerCase())
    })

    it('resolves a native gas token to the 0xeee sentinel', () => {
      expect(resolveSourceToken({ chain: 'eth', token: 'ETH' })).toBe(
        NATIVE_TOKEN,
      )
      expect(resolveSourceToken({ chain: 'bsc', token: 'BNB' })).toBe(
        NATIVE_TOKEN,
      )
      expect(resolveSourceToken({ chain: 'polygon', token: 'POL' })).toBe(
        NATIVE_TOKEN,
      )
    })

    it('resolves dotted symbols like USDC.e', () => {
      expect(
        resolveSourceToken({ chain: 'polygon', token: 'USDC.e' }).toLowerCase(),
      ).toBe('0x2791bca1f2de4661ed88a30c99a7a9449aa84174')
    })

    it('passes through raw 0x addresses', () => {
      const raw = '0x1234567890123456789012345678901234567890'
      expect(resolveSourceToken({ chain: 'eth', token: raw })).toBe(raw)
    })

    it('throws for unknown symbols', () => {
      expect(() =>
        resolveSourceToken({ chain: 'eth', token: 'FOOBAR' }),
      ).toThrow(/Unknown token/)
    })

    it('rejects malformed 0x addresses (wrong length) by treating as a symbol', () => {
      // Anything that starts with 0x but isn't 42 chars long is treated as a
      // symbol → unknown symbol → throws.
      expect(() =>
        resolveSourceToken({ chain: 'eth', token: '0xabc' }),
      ).toThrow(/Unknown token/)
    })
  })
})
