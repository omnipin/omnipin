/** biome-ignore-all lint/style/noNonNullAssertion: asserting env tokens */

import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTar } from 'nanotar'

import { PROVIDERS } from '../../src/constants.js'
import { PinningNotSupportedError } from '../../src/errors.js'
import {
  callDaemon,
  DEFAULT_HOVERFLY_SOCKET,
} from '../../src/utils/hoverfly-daemon.js'

const { upload: uploadOnHoverfly } = PROVIDERS.HOVERFLY_TOKEN

const socket = Bun.env.OMNIPIN_HOVERFLY_SOCKET ?? DEFAULT_HOVERFLY_SOCKET
const key = Bun.env.OMNIPIN_HOVERFLY_KEY
const batch = Bun.env.OMNIPIN_HOVERFLY_TOKEN
const hasDaemon = existsSync(socket)
const canUpload = hasDaemon && Boolean(key && batch)

const tinyTarPath = async (): Promise<string> => {
  const bytes = createTar([
    { name: 'index.html', data: '<h1>omnipin × hoverfly daemon</h1>' },
  ]) as Uint8Array
  const path = join(tmpdir(), `omnipin-hoverfly-test-${Date.now()}.tar`)
  await writeFile(path, bytes)
  return path
}

describe('Hoverfly', () => {
  it('throws PinningNotSupportedError when not the first provider', async () => {
    await expect(
      uploadOnHoverfly({
        token: batch ?? '0x00',
        bytes: new Uint8Array() as Uint8Array<ArrayBuffer>,
        name: '',
        first: false,
        size: 0,
        cid: '',
      }),
    ).rejects.toThrow(PinningNotSupportedError)
  })

  it.skipIf(hasDaemon)(
    'fails clearly when no daemon socket is present',
    async () => {
      await expect(
        uploadOnHoverfly({
          token: batch ?? '0x00',
          key: key ?? '0xab',
          path: await tinyTarPath(),
          socket: '/tmp/definitely-no-hoverfly.sock',
          bytes: new Uint8Array() as Uint8Array<ArrayBuffer>,
          name: '',
          first: true,
          size: 0,
          cid: '',
        }),
      ).rejects.toThrow(/no hoverfly daemon/)
    },
  )

  it.skipIf(!hasDaemon)('pings a running daemon', async () => {
    expect(await callDaemon(socket, { op: 'ping' })).toEqual({ status: 'pong' })
  })

  it.skipIf(!canUpload)(
    'uploads a tiny collection through the daemon',
    async () => {
      const { cid, rID } = await uploadOnHoverfly({
        token: batch!,
        key: key!,
        path: await tinyTarPath(),
        socket,
        bytes: new Uint8Array() as Uint8Array<ArrayBuffer>,
        name: '',
        first: true,
        size: 0,
        cid: '',
        verbose: true,
      })
      expect(rID).toMatch(/^[0-9a-f]{64}$/i)
      expect(cid).toMatch(/^[a-z2-7]+$/)
      console.log(`Open: https://${cid}.bzz.limo/`)
    },
    { timeout: 120_000 },
  )
})
