import * as assert from 'node:assert'
import { describe, it } from 'node:test'

import { unpinOnBlockfrost } from '../../src/providers/ipfs/blockfrost.js'

const hasToken = Boolean(process.env.OMNIPIN_BLOCKFROST_TOKEN)
const TEST_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

describe('Blockfrost', () => {
  describe('unpin', () => {
    it('should throw DeployError with invalid token', async () => {
      await assert.rejects(
        unpinOnBlockfrost({ token: 'bad-token', cid: TEST_CID }),
        /Failed to deploy on Blockfrost/,
      )
    })

    it('should unpin a CID successfully', {
      skip: !hasToken,
      timeout: 30_000,
    }, async () => {
      const token = process.env.OMNIPIN_BLOCKFROST_TOKEN!
      const result = await unpinOnBlockfrost({ token, cid: TEST_CID })
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.cid, TEST_CID)
    })
  })
})
