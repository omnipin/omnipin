import { describe, expect, it } from 'bun:test'

import { unpinOnBlockfrost } from '../../src/providers/ipfs/blockfrost.js'

const hasToken = Boolean(Bun.env.OMNIPIN_BLOCKFROST_TOKEN)
const TEST_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

describe('Blockfrost', () => {
  describe('unpin', () => {
    it('should throw DeployError with invalid token', async () => {
      await expect(
        unpinOnBlockfrost({ token: 'bad-token', cid: TEST_CID }),
      ).rejects.toThrow('Failed to deploy on Blockfrost')
    })

    it.skipIf(!hasToken)(
      'should unpin a CID successfully',
      async () => {
        const token = Bun.env.OMNIPIN_BLOCKFROST_TOKEN!
        const result = await unpinOnBlockfrost({ token, cid: TEST_CID })
        expect(result.success).toBe(true)
        expect(result.cid).toBe(TEST_CID)
      },
      { timeout: 30_000 },
    )
  })
})
