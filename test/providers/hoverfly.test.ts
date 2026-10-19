import * as assert from 'node:assert'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createTar } from 'nanotar'

import { PROVIDERS } from '../../src/constants.js'
import { PinningNotSupportedError } from '../../src/errors.js'
import {
  callDaemon,
  DEFAULT_HOVERFLY_SOCKET,
} from '../../src/utils/hoverfly-daemon.js'
import { encodeFrame, startFakeDaemon } from '../helpers/hoverfly-daemon.js'

const { upload: uploadOnHoverfly } = PROVIDERS.HOVERFLY_TOKEN

const socket = process.env.OMNIPIN_HOVERFLY_SOCKET ?? DEFAULT_HOVERFLY_SOCKET
const key = process.env.OMNIPIN_HOVERFLY_KEY
const batch = process.env.OMNIPIN_HOVERFLY_TOKEN
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
  it('should throw PinningNotSupportedError when not the first provider', async () => {
    await assert.rejects(
      uploadOnHoverfly({
        token: batch ?? '0x00',
        bytes: new Uint8Array() as Uint8Array<ArrayBuffer>,
        name: '',
        first: false,
        size: 0,
        cid: '',
      }),
      PinningNotSupportedError,
    )
  })

  it('should fail clearly when no daemon socket is present', {
    skip: hasDaemon,
  }, async () => {
    await assert.rejects(
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
      /no hoverfly daemon/,
    )
  })

  it('should ping a running daemon', { skip: !hasDaemon }, async () => {
    assert.deepEqual(await callDaemon(socket, { op: 'ping' }), {
      status: 'pong',
    })
  })

  it('should send a collection upload request to the daemon', async () => {
    const daemon = await startFakeDaemon((request) =>
      request.op === 'ping'
        ? [encodeFrame({ status: 'pong' })]
        : [
            encodeFrame({ status: 'progress', done: 1, total: 1 }),
            encodeFrame({
              status: 'uploaded',
              root: 'ab'.repeat(32),
              bytes: 128,
            }),
          ],
    )

    try {
      const result = await uploadOnHoverfly({
        token: '0xcd',
        key: '0xef',
        path: await tinyTarPath(),
        socket: daemon.path,
        // Pin the depth so the test doesn't hit the chain.
        depth: 20,
        bytes: new Uint8Array() as Uint8Array<ArrayBuffer>,
        name: '',
        first: true,
        size: 0,
        cid: '',
      })

      assert.equal(result.rID, 'ab'.repeat(32))
      assert.match(result.cid, /^[a-z2-7]+$/)

      const upload = daemon.requests.find((r) => r.op === 'upload')
      assert.ok(upload, 'the daemon should receive an upload request')
      assert.equal(upload.collection, true)
      assert.equal(upload.progress, true)
      assert.equal(upload.depth, 20)
      assert.equal(upload.index_document, 'index.html')
      // Left unset, like `hoverfly upload` does — a missing path should 404.
      assert.equal(upload.error_document, null)
    } finally {
      await daemon.close()
    }
  })

  it('should upload a tiny collection through the daemon', {
    skip: !canUpload,
    timeout: 120_000,
  }, async () => {
    const { cid, rID } = await uploadOnHoverfly({
      token: batch as string,
      key: key as string,
      path: await tinyTarPath(),
      socket,
      bytes: new Uint8Array() as Uint8Array<ArrayBuffer>,
      name: '',
      first: true,
      size: 0,
      cid: '',
      verbose: true,
    })
    assert.match(rID as string, /^[0-9a-f]{64}$/i)
    assert.match(cid as string, /^[a-z2-7]+$/)
    console.log(`Open: https://${cid}.bzz.limo/`)
  })
})
