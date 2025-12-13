import { describe, expect, it } from 'bun:test'
import { filecoinMainnet } from '../../../src/utils/filecoin/constants'
import { getProviderMetadata } from '../../../src/utils/filecoin/getProviderMetadata'

describe('getProviderMetadata', () => {
  it('should return a random provider ID from a list of approved SPs', async () => {
    const provider = await getProviderMetadata({
      chain: filecoinMainnet,
      providerId: 1n,
    })

    expect(provider).toMatchInlineSnapshot(`
      {
        "address": "0x32c90c26bca6ed3945de9b29ba4e19d38314d618",
        "serviceURL": "https://main.ezpdpz.net",
      }
    `)
  })
})
