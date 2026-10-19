import * as assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import { MissingKeyError } from '../../src/errors.js'
import {
  findEnvVarProviderName,
  parseBoolean,
  parseNumber,
  parseTokensFromEnv,
  resolveSignerKey,
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
      assert.strictEqual(tokens.get('PINATA_TOKEN'), 'pinata-key')
      assert.strictEqual(tokens.get('AIOZ_TOKEN'), 'aioz-key')
    })

    it('skips empty or falsy values', () => {
      process.env = {
        OMNIPIN_PINATA_TOKEN: '',
        OMNIPIN_AIOZ_TOKEN: 'aioz-key',
      }
      const tokens = parseTokensFromEnv()
      assert.strictEqual(tokens.has('PINATA_TOKEN'), false)
      assert.strictEqual(tokens.get('AIOZ_TOKEN'), 'aioz-key')
    })

    it('skips non-OMNIPIN_ env vars', () => {
      process.env = {
        PATH: '/usr/bin',
        HOME: '/root',
        OMNIPIN_PINATA_TOKEN: 'pinata-key',
      }
      const tokens = parseTokensFromEnv()
      assert.strictEqual(tokens.get('PINATA_TOKEN'), 'pinata-key')
      assert.strictEqual(tokens.has('PATH'), false)
      assert.strictEqual(tokens.has('HOME'), false)
    })
  })

  describe('parseNumber', () => {
    it('parses numeric values', () => {
      assert.strictEqual(parseNumber('8'), 8)
      assert.strictEqual(parseNumber('0'), 0)
      assert.strictEqual(parseNumber('20.5'), 20.5)
    })

    it('returns undefined for missing or non-numeric values', () => {
      assert.strictEqual(parseNumber(undefined), undefined)
      assert.strictEqual(parseNumber(''), undefined)
      assert.strictEqual(parseNumber('many'), undefined)
      assert.strictEqual(parseNumber('Infinity'), undefined)
    })
  })

  describe('parseBoolean', () => {
    it('parses truthy values', () => {
      for (const value of ['1', 'true', 'TRUE', 'yes', 'on'])
        assert.strictEqual(parseBoolean(value), true, value)
    })

    it('parses falsy values', () => {
      for (const value of ['0', 'false', 'FALSE', 'no', 'off'])
        assert.strictEqual(parseBoolean(value), false, value)
    })

    it('returns undefined for missing or unrecognized values', () => {
      assert.strictEqual(parseBoolean(undefined), undefined)
      assert.strictEqual(parseBoolean(''), undefined)
      assert.strictEqual(parseBoolean('maybe'), undefined)
    })
  })

  describe('tokensToProviderNames', () => {
    it('maps known token keys to provider names', () => {
      const result = tokensToProviderNames([
        'PINATA_TOKEN',
        'AIOZ_TOKEN',
        'FILECOIN_TOKEN',
      ])
      assert.deepStrictEqual(result, ['Pinata', 'AIOZ', 'Filecoin'])
    })

    it('throws UnknownProviderError for unknown _TOKEN keys', () => {
      assert.throws(
        () => tokensToProviderNames(['PINATA_TOKEN', 'FAKE_TOKEN']),
        /Unknown provider FAKE_TOKEN/,
      )
    })

    it('silently skips unknown keys without _TOKEN suffix', () => {
      const result = tokensToProviderNames([
        'PINATA_TOKEN',
        'SOME_OTHER_VAR',
        'AIOZ_TOKEN',
      ])
      assert.deepStrictEqual(result, ['Pinata', 'AIOZ'])
    })

    it('returns empty array for empty input', () => {
      const result = tokensToProviderNames([])
      assert.deepStrictEqual(result, [])
    })
  })

  describe('findEnvVarProviderName', () => {
    it('finds the token key for a known provider', () => {
      assert.strictEqual(findEnvVarProviderName('Pinata'), 'PINATA_TOKEN')
    })

    it('throws for an unknown provider', () => {
      assert.throws(
        () => findEnvVarProviderName('NonExistent'),
        /Unknown provider/,
      )
      assert.throws(() => findEnvVarProviderName(''), /Unknown provider/)
    })
  })

  describe('resolveSignerKey', () => {
    const PROVIDER_KEY = '0xprovider'
    const PK = '0xpk'

    it('prefers the provider-specific key over OMNIPIN_PK', () => {
      process.env = {
        OMNIPIN_FILECOIN_TOKEN: PROVIDER_KEY,
        OMNIPIN_PK: PK,
      }
      assert.strictEqual(resolveSignerKey('Filecoin'), PROVIDER_KEY)
    })

    it('falls back to OMNIPIN_PK when the provider key is unset', () => {
      process.env = { OMNIPIN_PK: PK }
      assert.strictEqual(resolveSignerKey('Filecoin'), PK)
    })

    it('resolves the AIOZ provider key', () => {
      process.env = { OMNIPIN_AIOZ_TOKEN: PROVIDER_KEY }
      assert.strictEqual(resolveSignerKey('AIOZ'), PROVIDER_KEY)
    })

    it('throws MissingKeyError naming the provider var when nothing is set', () => {
      process.env = {}
      assert.throws(() => resolveSignerKey('Filecoin'), MissingKeyError)
      assert.throws(
        () => resolveSignerKey('Filecoin'),
        /OMNIPIN_FILECOIN_TOKEN/,
      )
    })
  })
})
