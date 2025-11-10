import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import {
  filecoinCalibration,
  filecoinMainnet,
} from '~/utils/filecoin/constants.js'
import { getUSDfcBalance } from '~/utils/filecoin/getUSDfcBalance.js'

describe('getUSDfcBalance', () => {
  it('works on mainnet', async () => {
    const balance = await getUSDfcBalance({
      chain: filecoinMainnet,
      address: '0x838294AdDe22F9dCc62A0e6ed99aaad4D037cA3A',
    })
    assert.ok(typeof balance === 'bigint')
    assert.ok(balance > 0n)
  })
  it('works on testnet', async () => {
    const balance = await getUSDfcBalance({
      chain: filecoinCalibration,
      address: '0x838294AdDe22F9dCc62A0e6ed99aaad4D037cA3A',
    })
    assert.ok(typeof balance === 'bigint')
    assert.ok(balance > 0n)
  })
})
