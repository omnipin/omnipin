import { describe, expect, it } from 'bun:test'
import { chains } from '../src/constants'

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
          "contracts": {
            "publicResolver": {
              "address": "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
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
          "contracts": {
            "publicResolver": {
              "address": "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD",
            },
          },
          "id": 11155111,
          "name": "Sepolia",
        },
      }
    `)
  })
})
