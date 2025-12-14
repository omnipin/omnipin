import { describe, expect, it, mock } from 'bun:test'
import { DeployError } from '../../src/errors.js'
import { uploadOnS3 } from '../../src/providers/ipfs/s3.js'

const success = new Response(null, { status: 200 })
const failure = new Response('mock', { status: 400 })

describe('s3', () => {
  it('should upload a car to s3', async () => {
    mock.module('@stauro/filebase-upload', async () => {
      return {
        uploadCar: async () => success,
      }
    })
    const res = await uploadOnS3({
      name: 'test.car',
      car: new Blob([]),
      token: 'token',
      bucketName: 'bucketName',
      apiUrl: 'https://example.com',
      providerName: 'S3',
      verbose: false,
    })
    expect(res.status).toEqual(success.status)
  })
  it('should throw if upload fails', async () => {
    mock.module('@stauro/filebase-upload', async () => {
      return {
        uploadCar: async () => failure,
      }
    })
    expect(
      uploadOnS3({
        name: 'test.car',
        car: new Blob([]),
        token: 'token',
        bucketName: 'bucketName',
        apiUrl: 'https://example.com',
        providerName: 'S3',
        verbose: false,
      }),
    ).rejects.toThrow(DeployError)
  })
})
