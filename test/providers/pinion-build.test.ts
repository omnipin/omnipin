/** biome-ignore-all lint/style/noNonNullAssertion: status is declared optional on the registry entry */
import { afterEach, describe, expect, it } from 'bun:test'
import { PROVIDERS } from '../../src/constants.js'
import { DeployError } from '../../src/errors.js'
import {
  statusOnPinionBuild,
  unpinOnPinionBuild,
  uploadOnPinionBuild,
} from '../../src/providers/ipfs/pinion-build.js'

const { upload, status, unpin } = PROVIDERS.PINION_BUILD_TOKEN

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

const originalFetch = globalThis.fetch

/** Record the URL and init of every request and answer with a canned response. */
const stubFetch = (respond: (url: string) => Response) => {
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    calls.push({ url, init })
    return respond(url)
  }) as typeof fetch
  return calls
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('Pinion.build', () => {
  it('is registered in PROVIDERS with upload, status, and unpin', () => {
    expect(upload).toBe(uploadOnPinionBuild)
    expect(status).toBe(statusOnPinionBuild)
    expect(unpin).toBe(unpinOnPinionBuild)
    expect(PROVIDERS.PINION_BUILD_TOKEN.supported).toBe('both')
    expect(PROVIDERS.PINION_BUILD_TOKEN.protocol).toBe('ipfs')
    expect(PROVIDERS.PINION_BUILD_TOKEN.name).toBe('Pinion.build')
  })

  describe('upload', () => {
    it('posts the CAR bytes to the upload API with the name as a query param', async () => {
      const calls = stubFetch(
        () =>
          new Response(
            JSON.stringify({
              requestid: 'req-1',
              status: 'pinning',
              pin: { cid: CID, name: 'omnipin-test' },
            }),
            { status: 200 },
          ),
      )

      await uploadOnPinionBuild({
        first: true,
        bytes: new Uint8Array([1, 2, 3]),
        name: 'omnipin-test',
        token: 'token',
        cid: CID,
        size: 3,
      })

      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe(
        'https://helium.pinion.build/upload/pat/v1/?format=car&name=omnipin-test',
      )
      expect(calls[0].init?.method).toBe('POST')
      const headers = new Headers(calls[0].init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer token')
      expect(headers.get('Content-Type')).toBe('application/vnd.ipld.car')
    })

    it('returns the CID from pin.cid and reports queued', async () => {
      stubFetch(
        () =>
          new Response(
            JSON.stringify({ status: 'pinning', pin: { cid: CID } }),
            { status: 200 },
          ),
      )

      const result = await uploadOnPinionBuild({
        first: true,
        bytes: new Uint8Array(),
        name: 'omnipin-test',
        token: 'token',
        cid: CID,
        size: 0,
      })

      expect(result.cid).toBe(CID)
      expect(result.status).toBe('queued')
    })

    // Errors from the upload API always come back through the shared
    // apierror envelope: `{ code, message, request_id }`.
    it('surfaces the apierror envelope message as a DeployError', async () => {
      stubFetch(
        () =>
          new Response(
            JSON.stringify({
              code: 'import_failed',
              message: 'the uploaded content could not be imported',
            }),
            { status: 400 },
          ),
      )

      await expect(
        uploadOnPinionBuild({
          first: true,
          bytes: new Uint8Array(),
          name: 'omnipin-test',
          token: 'token',
          cid: CID,
          size: 0,
        }),
      ).rejects.toThrow(/the uploaded content could not be imported/)
    })

    it('pins an existing CID via the spec-compliant pinning API when not first', async () => {
      const calls = stubFetch(
        () =>
          new Response(
            JSON.stringify({ status: 'queued', pin: { cid: CID } }),
            { status: 200 },
          ),
      )

      const result = await uploadOnPinionBuild({
        first: false,
        bytes: new Uint8Array(),
        name: 'omnipin-test',
        token: 'token',
        cid: CID,
        size: 0,
      })

      expect(calls).toEqual([
        {
          url: 'https://helium.pinion.build/pinning/pat/v1/pins',
          init: calls[0].init,
        },
      ])
      expect(calls[0].init?.method).toBe('POST')
      expect(result.cid).toBe(CID)
      expect(result.status).toBe('queued')
    })
  })

  describe('status', () => {
    it('queries the pinning API pins endpoint', async () => {
      const calls = stubFetch(
        () =>
          new Response(
            JSON.stringify({ count: 1, results: [{ status: 'pinned' }] }),
            { status: 200 },
          ),
      )

      const { pin } = await statusOnPinionBuild({
        cid: CID,
        auth: { token: 'token' },
      })

      expect(calls[0].url).toBe(
        `https://helium.pinion.build/pinning/pat/v1/pins?cid=${CID}&limit=1`,
      )
      expect(pin).toBe('pinned')
    })

    it('returns "not pinned" for an unknown CID', async () => {
      stubFetch(
        () => new Response(JSON.stringify({ count: 0 }), { status: 200 }),
      )

      const { pin } = await statusOnPinionBuild({
        cid: CID,
        auth: { token: 'token' },
      })

      expect(pin).toBe('not pinned')
    })
  })

  describe('unpin', () => {
    it('lists then deletes the pin by requestid', async () => {
      const calls = stubFetch((url) => {
        if (url.includes('/pins?')) {
          return new Response(
            JSON.stringify({ count: 1, results: [{ requestid: 'req-1' }] }),
            { status: 200 },
          )
        }
        return new Response(null, { status: 202 })
      })

      const result = await unpinOnPinionBuild({ cid: CID, token: 'token' })

      expect(calls[0].url).toBe(
        `https://helium.pinion.build/pinning/pat/v1/pins?cid=${CID}&limit=1`,
      )
      expect(calls[1].url).toBe(
        'https://helium.pinion.build/pinning/pat/v1/pins/req-1',
      )
      expect(calls[1].init?.method).toBe('DELETE')
      expect(result).toEqual({ success: true, cid: CID })
    })

    it('surfaces the spec error envelope as a DeployError', async () => {
      stubFetch(
        () =>
          new Response(
            JSON.stringify({ error: { reason: 'FORBIDDEN', details: 'nope' } }),
            { status: 403 },
          ),
      )

      await expect(
        unpinOnPinionBuild({ cid: CID, token: 'token' }),
      ).rejects.toBeInstanceOf(DeployError)
    })
  })
})
