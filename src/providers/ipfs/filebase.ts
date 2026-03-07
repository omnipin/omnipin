import { DeployError, MissingKeyError } from '../../errors.js'
import type { StatusFunction, UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { uploadOnS3 } from './s3.js'
import { specStatus } from './spec.js'

const providerName = 'Filebase'
const baseURL = 'https://rpc.filebase.io/api/v0'

export const uploadOnFilebase: UploadFunction<{ bucketName: string }> = async ({
  first,
  car,
  name,
  token,
  bucketName,
  verbose,
  cid,
}) => {
  if (first) {
    if (!bucketName) throw new MissingKeyError(`FILEBASE_BUCKET_NAME`)

    const res = await uploadOnS3({
      bucketName,
      apiUrl: 's3.filebase.com',
      providerName,
      verbose,
      name,
      car,
      size: car.size,
      token,
    })

    return { cid: res.headers.get('x-amz-meta-cid')!, status: 'queued' }
  }

  const res = await fetch(new URL(`/pin/add?arg=${cid}`, baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      cid,
      name,
    }),
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const json = await res.json()

  if (!res.ok) throw new DeployError(providerName, json.error.details)

  return { status: json.status, cid: json?.ipfs_hash ?? json.Pins[0] }
}

export const statusOnFilebase: StatusFunction = async ({ cid, auth }) =>
  specStatus({ baseURL, cid, auth })
