import { describe, expect, it } from 'bun:test'

import {
  depositFula,
  detectFulaChain,
  FULA_CHAINS,
  FULA_VAULT_ADDRESS,
  isFulaChainKey,
} from '../../src/utils/fula-deposit.js'

// A throwaway, well-known test private key (Hardhat account #0). Used only to
// derive a signer address for amount-validation tests; no transaction is sent.
const TEST_PK =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

describe('Fula deposit', () => {
  describe('config', () => {
    it('exposes FULA ERC-20 addresses on eth and base', () => {
      expect(FULA_CHAINS.eth.id).toBe(1)
      expect(FULA_CHAINS.eth.token).toBe(
        '0x92217cCaEDBdbc54C76c15feA18823db1558fDc9',
      )
      expect(FULA_CHAINS.base.id).toBe(8453)
      expect(FULA_CHAINS.base.token).toBe(
        '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB',
      )
    })

    it('points at the Fula payment vault by default', () => {
      expect(FULA_VAULT_ADDRESS).toBe(
        '0x83dF763874934Cc72C309dA5566eA2AFB6eE4f4e',
      )
    })

    it('guards chain keys', () => {
      expect(isFulaChainKey('eth')).toBe(true)
      expect(isFulaChainKey('base')).toBe(true)
      expect(isFulaChainKey('polygon')).toBe(false)
      expect(isFulaChainKey(undefined)).toBe(false)
    })
  })

  describe('amount validation', () => {
    it('rejects a non-numeric amount before any network call', async () => {
      await expect(
        depositFula({
          privateKey: TEST_PK,
          amount: 'abc',
          chain: 'eth',
        }),
      ).rejects.toThrow('Invalid amount: abc')
    })

    it('rejects a zero amount', async () => {
      await expect(
        depositFula({
          privateKey: TEST_PK,
          amount: '0',
          chain: 'base',
        }),
      ).rejects.toThrow('Amount must be positive')
    })

    it('rejects a negative amount', async () => {
      await expect(
        depositFula({
          privateKey: TEST_PK,
          amount: '-5',
          chain: 'eth',
        }),
      ).rejects.toThrow()
    })
  })

  describe('chain auto-detection', () => {
    it(
      'detects the chain where the owner holds $FULA (vault holds it on Base)',
      async () => {
        // The Fula vault holds $FULA on Base and none on Ethereum, so it is a
        // stable, live fixture for the "highest balance wins" heuristic.
        const chain = await detectFulaChain({ owner: FULA_VAULT_ADDRESS })
        expect(chain).toBe('base')
      },
      { timeout: 20_000 },
    )

    it(
      'returns undefined when the owner holds no $FULA on any chain',
      async () => {
        const chain = await detectFulaChain({
          owner: '0x000000000000000000000000000000000000dEaD',
        })
        expect(chain).toBeUndefined()
      },
      { timeout: 20_000 },
    )
  })
})
