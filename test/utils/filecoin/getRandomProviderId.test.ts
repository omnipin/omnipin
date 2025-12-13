import { describe, expect, it } from 'bun:test'
import { filecoinMainnet } from '../../../src/utils/filecoin/constants'
import { getRandomProviderId } from '../../../src/utils/filecoin/getRandomProviderId'

describe('getRandomProviderId', () => {
  it('should return a random provider ID from a list of approved SPs', async () => {
    const providerId = await getRandomProviderId({ chain: filecoinMainnet })

    expect(providerId).toBeTypeOf('bigint')

    expect(providerId > 0n).toBeTrue()
  })
})
