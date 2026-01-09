import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import { Provider } from 'ox'
import { fromHttp } from 'ox/RpcTransport'
import { resolveEnsName } from '../../src/utils/ens/resolve-name.js'
import { chainToRpcUrl, prepareUpdateEnsArgs } from '../../src/utils/ens.js'

describe('ens utils', () => {
  describe('prepareUpdateEnsArgs', () => {
    it('should properly encode a valid IPFS CIDv1', () => {
      const { contentHash, node } = prepareUpdateEnsArgs({
        domain: 'v1rtl.eth',
        cid: 'bafybeidff2jppmcuimseu24mhwy57yxiebigxbefwhsrpfcybsyfvcvvte',
      })

      assert.equal(
        contentHash,
        'e30101701220652e92f7b05443244a6b8c3db1dfe2e820506b8485b1e51794580cb05a8ab599',
      )
      assert.equal(
        node,
        '0x6dd56164f699a101d6063add452dfed7c6c09fe17b8e4acf3328f9387f5030b9',
      )
    })
    it('should properly encode a valid Swarm Reference', () => {
      const { contentHash, node } = prepareUpdateEnsArgs({
        domain: 'v1rtl.eth',
        cid: 'd1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162',
        codec: 'swarm',
      })

      assert.equal(
        contentHash,
        'e40101fa011b20d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162',
      )
      assert.equal(
        node,
        '0x6dd56164f699a101d6063add452dfed7c6c09fe17b8e4acf3328f9387f5030b9',
      )
    })
    it('should throw on invalid ENS name', () => {
      assert.throws(
        () => {
          prepareUpdateEnsArgs({
            domain: 'v1rtl%%th',
            cid: 'bafybeidff2jppmcuimseu24mhwy57yxiebigxbefwhsrpfcybsyfvcvvte',
          })
        },
        {
          name: 'Error',
          message: /disallowed character/,
        },
      )
    })
    it('should throw on invalid CID', () => {
      assert.throws(
        () => {
          prepareUpdateEnsArgs({
            domain: 'v1rtl.eth',
            cid: '111',
          })
        },
        {
          name: 'Error',
          message:
            'Unable to decode multibase string "111", base32 decoder only supports inputs prefixed with b',
        },
      )
    })
  })
  describe('chainToRpcUrl', () => {
    it('returns default RPC URLs for mainnet and sepolia', () => {
      assert.equal(
        chainToRpcUrl('mainnet'),
        'https://ethereum-rpc.publicnode.com',
      )
      assert.equal(
        chainToRpcUrl('sepolia'),
        'https://ethereum-sepolia-rpc.publicnode.com',
      )
    })
  })
  describe('resolveEnsName', () => {
    it('should resolve .eth names', async () => {
      const provider = Provider.from(fromHttp(chainToRpcUrl('mainnet')))

      const addr = await resolveEnsName({
        provider,
        name: 'safe.omnipin.eth',
      })

      assert.equal(addr, '0x0fd2ca6b1a52a1153da0b31d02fd53854627d262')
    })
    it('should work on sepolia', async () => {
      const provider = Provider.from(fromHttp(chainToRpcUrl('sepolia')))

      const addr = await resolveEnsName({
        provider,
        name: 'gregskril.eth',
      })

      assert.equal(addr, '0x179a862703a4adfb29896552df9e307980d19285')
    })
  })
})
