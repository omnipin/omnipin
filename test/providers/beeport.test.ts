import { describe, expect, it } from 'bun:test'
import { createTar } from 'nanotar'

// Force `constants.ts` to finish initialising before any individual provider
// module gets imported — avoids a load-time TDZ cycle through
// `logger.ts → constants.ts → providers/swarm/beeport.ts`.
import '../../src/constants.js'

import { PinningNotSupportedError } from '../../src/errors.js'
import { uploadOnBeeport } from '../../src/providers/swarm/beeport.js'
import {
  getDepthForSize,
  parseDuration,
  parseSize,
} from '../../src/utils/swarm-batch.js'

const hasToken = Boolean(Bun.env.OMNIPIN_BEEPORT_TOKEN)
const hasBatchId = Boolean(Bun.env.OMNIPIN_BEEPORT_BATCH_ID)

describe('Beeport', () => {
  describe('upload', () => {
    it('should throw if pinning was chosen (first=false)', async () => {
      await expect(
        uploadOnBeeport({
          first: false,
          token: '',
          bytes: new Uint8Array(),
          name: 'test',
          size: 0,
          cid: '',
        }),
      ).rejects.toThrow(PinningNotSupportedError)
    })

    it('should throw MissingKeyError when no private key is set', async () => {
      const previous = process.env.OMNIPIN_BEEPORT_TOKEN
      delete process.env.OMNIPIN_BEEPORT_TOKEN
      try {
        await expect(
          uploadOnBeeport({
            first: true,
            token: '',
            bytes: new Uint8Array(),
            name: 'test',
            size: 0,
            cid: '',
          }),
        ).rejects.toThrow('OMNIPIN_BEEPORT_TOKEN is missing')
      } finally {
        if (previous !== undefined) {
          process.env.OMNIPIN_BEEPORT_TOKEN = previous
        }
      }
    })

    // Live upload — only runs if both the signing key and a pre-purchased
    // batch id are available. Auto-purchase is intentionally not exercised in
    // CI because it sends a real Gnosis tx.
    it.skipIf(!hasToken || !hasBatchId)(
      'should upload to Beeport with a configured batch id',
      async () => {
        // Beeport (and Bee) treat the upload body as a TAR-encoded collection.
        const html = new TextEncoder().encode(
          '<!doctype html><title>omnipin beeport test</title>hello',
        )
        const tar = createTar([{ name: 'index.html', data: html }]) as Uint8Array
        const bytes = new Uint8Array(tar.byteLength)
        bytes.set(tar)
        const result = await uploadOnBeeport({
          first: true,
          token: '',
          bytes: bytes as Uint8Array<ArrayBuffer>,
          name: 'omnipin-beeport-test',
          size: bytes.byteLength,
          cid: '',
          verbose: true,
        })
        expect(result.rID).toMatch(/^[0-9a-f]{64}$/)
        expect(result.cid).toMatch(/^[a-z2-7]+$/)
      },
      { timeout: 60_000 },
    )
  })
})

describe('swarm-batch helpers', () => {
  describe('parseSize', () => {
    it('parses MB / MiB correctly', () => {
      expect(parseSize('110MB')).toBe(110n * 1000n * 1000n)
      expect(parseSize('110MiB')).toBe(110n * 1024n * 1024n)
    })

    it('parses GB / GiB correctly', () => {
      expect(parseSize('1GB')).toBe(1_000_000_000n)
      expect(parseSize('1GiB')).toBe(1_073_741_824n)
    })

    it('parses bare byte counts', () => {
      expect(parseSize('1024')).toBe(1024n)
      expect(parseSize('1024B')).toBe(1024n)
    })

    it('throws on invalid input', () => {
      expect(() => parseSize('not-a-size')).toThrow()
    })
  })

  describe('parseDuration', () => {
    it('parses days / hours / minutes / weeks', () => {
      expect(parseDuration('30d')).toBe(2_592_000n)
      expect(parseDuration('24h')).toBe(86_400n)
      expect(parseDuration('60m')).toBe(3600n)
      expect(parseDuration('1w')).toBe(604_800n)
    })

    it('parses bare second counts', () => {
      expect(parseDuration('3600')).toBe(3600n)
      expect(parseDuration('3600s')).toBe(3600n)
    })

    it('throws on invalid input', () => {
      expect(() => parseDuration('not-a-duration')).toThrow()
    })
  })

  describe('getDepthForSize', () => {
    it('returns depth 19 for 110 MB', () => {
      expect(getDepthForSize(110n * 1000n * 1000n)).toBe(19)
    })

    it('returns depth 17 for very small sizes', () => {
      expect(getDepthForSize(1000n)).toBe(17)
    })

    it('returns depth 20 for 500 MB', () => {
      expect(getDepthForSize(500n * 1000n * 1000n)).toBe(20)
    })
  })
})
