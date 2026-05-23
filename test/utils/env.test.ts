import { afterEach, describe, expect, it } from 'bun:test'
import {
  findEnvVarProviderName,
  parseTokensFromEnv,
  tokensToProviderNames,
} from '../../src/utils/env.js'

const SAVED_ENV = { ...process.env }

describe('env utils', () => {
  afterEach(() => {
    process.env = { ...SAVED_ENV }
  })

  describe('parseTokensFromEnv', () => {
    it('strips OMNIPIN_ prefix and returns known tokens', () => {
      process.env = {
        OMNIPIN_PINATA_TOKEN: 'pinata-key',
        OMNIPIN_AIOZ_TOKEN: 'aioz-key',
      }
      const tokens = parseTokensFromEnv()
      expect(tokens.get('PINATA_TOKEN')).toBe('pinata-key')
      expect(tokens.get('AIOZ_TOKEN')).toBe('aioz-key')
    })

    it('skips empty or falsy values', () => {
      process.env = {
        OMNIPIN_PINATA_TOKEN: '',
        OMNIPIN_AIOZ_TOKEN: 'aioz-key',
      }
      const tokens = parseTokensFromEnv()
      expect(tokens.has('PINATA_TOKEN')).toBeFalse()
      expect(tokens.get('AIOZ_TOKEN')).toBe('aioz-key')
    })

    it('skips non-OMNIPIN_ env vars', () => {
      process.env = {
        PATH: '/usr/bin',
        HOME: '/root',
        OMNIPIN_PINATA_TOKEN: 'pinata-key',
      }
      const tokens = parseTokensFromEnv()
      expect(tokens.get('PINATA_TOKEN')).toBe('pinata-key')
      expect(tokens.has('PATH')).toBeFalse()
      expect(tokens.has('HOME')).toBeFalse()
    })
  })

  describe('tokensToProviderNames', () => {
    it('maps known token keys to provider names', () => {
      const result = tokensToProviderNames([
        'PINATA_TOKEN',
        'AIOZ_TOKEN',
        'FILECOIN_TOKEN',
      ])
      expect(result).toEqual(['Pinata', 'AIOZ', 'Filecoin'])
    })

    it('throws UnknownProviderError for unknown _TOKEN keys', () => {
      expect(() =>
        tokensToProviderNames(['PINATA_TOKEN', 'FAKE_TOKEN']),
      ).toThrow(/Unknown provider FAKE_TOKEN/)
    })

    it('silently skips unknown keys without _TOKEN suffix', () => {
      const result = tokensToProviderNames([
        'PINATA_TOKEN',
        'SOME_OTHER_VAR',
        'AIOZ_TOKEN',
      ])
      expect(result).toEqual(['Pinata', 'AIOZ'])
    })

    it('returns empty array for empty input', () => {
      const result = tokensToProviderNames([])
      expect(result).toEqual([])
    })
  })

  describe('findEnvVarProviderName', () => {
    it('finds the token key for a known provider', () => {
      expect(findEnvVarProviderName('Pinata')).toBe('PINATA_TOKEN')
    })

    it('returns undefined for unknown provider', () => {
      expect(findEnvVarProviderName('NonExistent')).toBeUndefined()
      expect(findEnvVarProviderName('')).toBeUndefined()
    })
  })
})
