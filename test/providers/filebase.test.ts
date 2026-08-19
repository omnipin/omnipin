/** biome-ignore-all lint/style/noNonNullAssertion: status is declared optional on the registry entry */
import { afterEach, describe, expect, it } from 'bun:test'
import { PROVIDERS } from '../../src/constants.js'
import { DeployError } from '../../src/errors.js'

// Reached through the registry rather than imported straight from
// `filebase.js`: `constants.ts` and `filebase.ts` form an import cycle via
// `logger.ts`, so loading the provider module first hits a TDZ error.
const { upload: uploadOnFilebase, status: statusOnFilebase } =
  PROVIDERS.FILEBASE_TOKEN

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

const originalFetch = globalThis.fetch

/** Record the URL of every request and answer with a canned response. */
const stubFetch = (respond: (url: string) => Response) => {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(input.toString())
    return respond(input.toString())
  }) as typeof fetch
  return calls
}

const pinArgs = {
  first: false,
  bytes: new Uint8Array(),
  name: 'omnipin-test',
  token: 'token',
  bucketName: '',
  cid: CID,
  size: 0,
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('Filebase', () => {
  describe('pin', () => {
    // Regression: the URL was built as `new URL('/pin/add?arg=…', baseURL)`,
    // and a root-relative path discards the base's `/api/v0`, so every
    // pin-by-CID request went to `https://rpc.filebase.io/pin/add`.
    it('posts to the RPC API under /api/v0, preserving the base path', async () => {
      const calls = stubFetch(
        () => new Response(JSON.stringify({ Pins: [CID] }), { status: 200 }),
      )

      await uploadOnFilebase(pinArgs)

      expect(calls).toEqual([
        `https://rpc.filebase.io/api/v0/pin/add?arg=${CID}`,
      ])
    })

    it('returns the CID reported in Pins[0]', async () => {
      stubFetch(
        () => new Response(JSON.stringify({ Pins: [CID] }), { status: 200 }),
      )

      const result = await uploadOnFilebase(pinArgs)

      expect(result.cid).toEqual(CID)
      expect(result.status).toEqual('queued')
    })

    it('falls back to the requested CID when the body omits Pins', async () => {
      stubFetch(() => new Response(JSON.stringify({}), { status: 200 }))

      expect((await uploadOnFilebase(pinArgs)).cid).toEqual(CID)
    })

    // The RPC API reports errors as `{ Message, Code, Type }`, so reading
    // `json.error.details` threw a TypeError instead of surfacing the reason.
    it('surfaces the RPC error Message as a DeployError', async () => {
      stubFetch(
        () =>
          new Response(
            JSON.stringify({ Message: 'not enough storage', Code: 0 }),
            { status: 400 },
          ),
      )

      await expect(uploadOnFilebase(pinArgs)).rejects.toThrow(
        /not enough storage/,
      )
      await expect(uploadOnFilebase(pinArgs)).rejects.toBeInstanceOf(
        DeployError,
      )
    })

    // Gateway and proxy errors are HTML, so `res.json()` used to throw before
    // the failure could be reported at all.
    it('reports a non-JSON error body without throwing a parse error', async () => {
      stubFetch(
        () =>
          new Response('<!DOCTYPE html><title>502</title>', { status: 502 }),
      )

      const err = (await uploadOnFilebase(pinArgs).catch(
        (e) => e,
      )) as DeployError

      expect(err).toBeInstanceOf(DeployError)
      expect(err.message).toContain('<!DOCTYPE html>')
    })

    it('falls back to the status line when the error body is empty', async () => {
      stubFetch(() => new Response('', { status: 500 }))

      await expect(uploadOnFilebase(pinArgs)).rejects.toThrow(/500/)
    })
  })

  describe('status', () => {
    // The `/pins` spec lives on the Pinning Service host; the RPC host does
    // not serve it. Sharing one base URL between the two pointed status at a
    // route that does not exist.
    it('queries the Pinning Service API, not the RPC host', async () => {
      const calls = stubFetch(
        () =>
          new Response(
            JSON.stringify({ count: 1, results: [{ status: 'pinned' }] }),
            { status: 200 },
          ),
      )

      const { pin } = await statusOnFilebase!({
        cid: CID,
        auth: { token: 'token' },
      })

      expect(calls).toEqual([
        `https://api.filebase.io/v1/ipfs/pins?cid=${CID}&limit=1`,
      ])
      expect(pin).toEqual('pinned')
    })
  })
})
