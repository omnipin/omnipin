import { UploadNotSupportedError } from '../../errors.js'
import type { PinFunction, StatusFunction } from '../../types.js'
// import { uploadOnS3 } from './s3.js'
import { specPin, specStatus } from './spec.js'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const uploadOn4everland: PinFunction<{
  bucketName?: string
}> = async ({ first, bucketName, ...args }) => {
  if (first) {
    throw new UploadNotSupportedError('4EVERLAND')
    // if (!bucketName) throw new MissingKeyError(`4EVERLAND_BUCKET_NAME`)
    // const res = await uploadOnS3({
    //   bucketName,
    //   apiUrl: 'https://endpoint.4everland.co',
    //   providerName: '4EVERLAND',
    //   ...args,
    // })

    // console.log(await res.json())

    // return { cid: res.headers.get('x-amz-meta-cid')!, status: 'queued' }
  } else {
    return specPin({
      first,
      ...args,
      providerName: '4EVERLAND',
      baseURL: 'https://api.4everland.dev',
    })
  }
}

export const statusOn4everland: StatusFunction = async ({ cid, auth }) =>
  specStatus({ baseURL: 'https://api.4everland.dev', cid, auth })
