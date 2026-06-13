import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getBalance } from '../../src/utils/tx.js'

describe('tx utils', () => {
  describe('getBalance', () => {
    it(
      'returns a positive bigint for vitalik.eth on Ethereum mainnet',
      async () => {
        const provider = Provider.from(
          fromHttp('https://ethereum-rpc.publicnode.com'),
        )
        // vitalik.eth — a stable, well-known EOA whose balance has been
        // non-zero for years. An EOA also avoids relying on contract
        // accounts which may be selfdestructed.
        const balance = await getBalance({
          provider,
          address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        })

        assert.strictEqual(typeof balance, 'bigint')
        assert.ok(balance > 0n, `expected positive balance, got ${balance}`)
      },
      { timeout: 15_000 },
    )
  })
})
