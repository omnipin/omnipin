import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { callDaemon } from '../../src/utils/hoverfly-daemon.js'
import { encodeFrame, startFakeDaemon } from '../helpers/hoverfly-daemon.js'

describe('hoverfly daemon client', () => {
  it('should answer a ping', async () => {
    const daemon = await startFakeDaemon(() => [
      encodeFrame({ status: 'pong' }),
    ])
    try {
      const response = await callDaemon(daemon.path, { op: 'ping' })
      assert.deepEqual(response, { status: 'pong' })
    } finally {
      await daemon.close()
    }
  })

  it('should stream progress frames and resolve with the terminal frame', async () => {
    const daemon = await startFakeDaemon(() => [
      encodeFrame({ status: 'progress', done: 1, total: 3 }),
      encodeFrame({ status: 'progress', done: 2, total: 3 }),
      encodeFrame({ status: 'uploaded', root: 'ab'.repeat(32), bytes: 128 }),
    ])

    const progress: number[] = []
    try {
      const response = await callDaemon(
        daemon.path,
        {
          op: 'upload',
          file: '/tmp/collection.tar',
          batch: 'cd'.repeat(32),
          depth: 20,
          key: 'ef'.repeat(32),
          max_retries: 10,
          concurrency: 8,
          raw: false,
          collection: true,
          progress: true,
          manifest_path: null,
          content_type: null,
          index_document: 'index.html',
          error_document: 'index.html',
        },
        (done) => progress.push(done),
      )

      assert.deepEqual(progress, [1, 2])
      assert.equal(response.status, 'uploaded')
      assert.equal(
        response.status === 'uploaded' ? response.root : '',
        'ab'.repeat(32),
      )
    } finally {
      await daemon.close()
    }
  })

  it('should reject when the daemon closes the connection early', async () => {
    const daemon = await startFakeDaemon(() => [])
    try {
      await assert.rejects(
        callDaemon(daemon.path, { op: 'ping' }),
        /closed connection early/,
      )
    } finally {
      await daemon.close()
    }
  })
})
