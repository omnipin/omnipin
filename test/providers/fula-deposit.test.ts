import * as assert from 'node:assert'
import { describe, it } from 'node:test'

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
      assert.strictEqual(FULA_CHAINS.eth.id, 1)
      assert.strictEqual(
        FULA_CHAINS.eth.token,
        '0x92217cCaEDBdbc54C76c15feA18823db1558fDc9',
      )
      assert.strictEqual(FULA_CHAINS.base.id, 8453)
      assert.strictEqual(
        FULA_CHAINS.base.token,
        '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB',
      )
    })

    it('points at the Fula payment vault by default', () => {
      assert.strictEqual(
        FULA_VAULT_ADDRESS,
        '0x83dF763874934Cc72C309dA5566eA2AFB6eE4f4e',
      )
    })

    it('guards chain keys', () => {
      assert.strictEqual(isFulaChainKey('eth'), true)
      assert.strictEqual(isFulaChainKey('base'), true)
      assert.strictEqual(isFulaChainKey('polygon'), false)
      assert.strictEqual(isFulaChainKey(undefined), false)
    })
  })

  describe('amount validation', () => {
    it('rejects a non-numeric amount before any network call', async () => {
      await assert.rejects(
        depositFula({
          privateKey: TEST_PK,
          amount: 'abc',
          chain: 'eth',
        }),
        /Invalid amount: abc/,
      )
    })

    it('rejects a zero amount', async () => {
      await assert.rejects(
        depositFula({
          privateKey: TEST_PK,
          amount: '0',
          chain: 'base',
        }),
        /Amount must be positive/,
      )
    })

    it('rejects a negative amount', async () => {
      await assert.rejects(
        depositFula({
          privateKey: TEST_PK,
          amount: '-5',
          chain: 'eth',
        }),
      )
    })
  })

  describe('chain auto-detection', () => {
    it('detects the chain where the owner holds $FULA (vault holds it on Base)', {
      timeout: 20_000,
    }, async () => {
      // The Fula vault holds $FULA on Base and none on Ethereum, so it is a
      // stable, live fixture for the "highest balance wins" heuristic.
      const chain = await detectFulaChain({ owner: FULA_VAULT_ADDRESS })
      assert.strictEqual(chain, 'base')
    })

    it('returns undefined when the owner holds no $FULA on any chain', {
      timeout: 20_000,
    }, async () => {
      const chain = await detectFulaChain({
        owner: '0x000000000000000000000000000000000000dEaD',
      })
      assert.strictEqual(chain, undefined)
    })
  })
})
