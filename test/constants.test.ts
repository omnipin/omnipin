import { describe, expect, it } from 'bun:test'
import { chains } from '../src/constants.js'

describe('constants', () => {
  it('chains snapshot matches', () => {
    expect(chains).toMatchInlineSnapshot(`
      {
        "mainnet": {
          "blockExplorers": {
            "default": {
              "name": "Etherscan",
              "url": "https://etherscan.io",
            },
          },
          "id": 1,
          "name": "Ethereum",
        },
        "sepolia": {
          "blockExplorers": {
            "default": {
              "name": "Etherscan",
              "url": "https://sepolia.etherscan.io",
            },
          },
          "id": 11155111,
          "name": "Sepolia",
        },
      }
    `)
  })
})
