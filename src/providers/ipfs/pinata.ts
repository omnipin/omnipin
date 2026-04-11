import { DeployError } from '../../errors.js'
import type { StatusFunction, UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { specPin, specStatus } from './spec.js'

const providerName = 'Pinata'

export const statusOnPinata: StatusFunction = (args) => {
  return specStatus({ ...args, baseURL: 'https://api.pinata.cloud/psa' })
}

export const uploadOnPinata: UploadFunction = async ({
  bytes,
  name,
  token,
  verbose,
  first,
  cid,
}) => {
  if (first) {
    const fd = new FormData()

    fd.append(
      'file',
      new Blob([bytes.buffer as ArrayBuffer], {
        type: 'application/vnd.ipld.car',
      }),
    )
    fd.append('network', 'public')

    fd.append('name', `${name}.car`)

    fd.append('car', 'true')

    const res = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: fd,
    })

    if (verbose) logger.request('POST', res.url, res.status)

    const json = await res.json()

    if (!res.ok) throw new DeployError(providerName, json.error.message)

    return { cid: json.data.cid }
  }
  return specPin({
    cid,
    name,
    token,
    providerName,
    baseURL: 'https://api.pinata.cloud/psa',
  })
}
