import { DeployError } from '../../errors.js'
import type {
  StatusFunction,
  UnpinFunction,
  UploadFunction,
} from '../../types.js'
import { logger } from '../../utils/logger.js'
import { specPin, specStatus, specUnpin } from './spec.js'

const providerName = 'Fula'

// Fula Land (Functionland) Cloud pinning service.
// https://docs.fx.land/pinning-service/ipfs-pinning-service-api
//
// Pin-by-CID, list, get and delete are the standard IPFS Pinning Service API
// (handled by the `spec` helpers). Uploading data that exists only on the
// client is done via the `POST /pins/import/car` vendor extension, which
// imports a CAR and pins its single root — preserving the local root CID
// exactly (no re-chunking or re-hashing).
const baseURL = 'https://api.cloud.fx.land'

const errorMessage = (json: {
  error?: { details?: string; reason?: string }
  message?: string
}) =>
  json.error?.details || json.error?.reason || json.message || 'Unknown error'

export const uploadOnFula: UploadFunction = async ({
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
      new Blob([bytes], { type: 'application/vnd.ipld.car' }),
      `${name}.car`,
    )

    if (name) fd.append('name', name)

    const res = await fetch(`${baseURL}/pins/import/car`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: fd,
    })

    if (verbose) logger.request('POST', res.url, res.status)

    const json = await res.json()

    if (!res.ok) throw new DeployError(providerName, errorMessage(json))

    return { cid: json.pin?.cid ?? cid, status: json.status }
  }

  // Pin an existing CID via the standard Pinning Service API.
  return specPin({
    first,
    cid,
    name,
    token,
    verbose,
    providerName,
    baseURL,
  })
}

export const statusOnFula: StatusFunction = (args) =>
  specStatus({ ...args, baseURL })

export const unpinOnFula: UnpinFunction = (args) =>
  specUnpin({ baseURL, providerName })(args)
