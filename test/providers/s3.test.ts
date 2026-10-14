import * as assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import { DeployError } from '../../src/errors.js'

const success = new Response(null, { status: 200 })
const failure = new Response('mock', { status: 400 })

let response: Response
mock.module('@stauro/filebase-upload', {
  namedExports: { uploadCar: async () => response },
})
// Loaded after the mock is registered, so s3.ts binds the stubbed uploadCar.
const { uploadOnS3 } = await import('../../src/providers/ipfs/s3.js')

describe('s3', () => {
  it('should upload a car to s3', async () => {
    response = success
    const res = await uploadOnS3({
      name: 'test.car',
      bytes: new Uint8Array(),
      token: 'token',
      bucketName: 'bucketName',
      apiUrl: 'https://example.com',
      providerName: 'S3',
      verbose: false,
      size: 0,
    })
    assert.strictEqual(res.status, success.status)
  })
  it('should throw if upload fails', async () => {
    response = failure
    await assert.rejects(
      uploadOnS3({
        name: 'test.car',
        bytes: new Uint8Array(),
        token: 'token',
        bucketName: 'bucketName',
        apiUrl: 'https://example.com',
        providerName: 'S3',
        verbose: false,
        size: 0,
      }),
      DeployError,
    )
  })
})
