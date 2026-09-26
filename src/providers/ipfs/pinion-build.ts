import { DeployError } from '../../errors.js'
import type {
  StatusFunction,
  UnpinFunction,
  UploadFunction,
} from '../../types.js'
import { logger } from '../../utils/logger.js'
import { specPin, specStatus, specUnpin } from './spec.js'

const providerName = 'Pinion.build'

// Pinion.build splits pinning across two hosts, both authenticated with the
// same PAT bearer token:
//   - a custom upload API that accepts plain files (multipart/form-data or
//     a raw octet-stream) as well as pre-built CAR archives; Omnipin always
//     hands it a CAR (built locally by packCAR), which the API preserves
//     exactly (no re-chunking or re-hashing) *provided* it's told the body
//     is a CAR -- otherwise it's chunked as a fresh UnixFS file/DAG and comes
//     back with a different CID entirely. Both `Content-Type:
//     application/vnd.ipld.car` and `?format=car` tell it so; sending both
//     is redundant but cheap insurance against either being dropped in
//     transit.
//   - a spec-compliant IPFS Pinning Service API (`specPin`/`specStatus`/
//     `specUnpin` already implement it) for pinning an existing CID,
//     checking status, and unpinning.
// See https://pinion.build/docs.
const UPLOAD_URL = 'https://helium.pinion.build/upload/pat/v1'
const PINNING_URL = 'https://helium.pinion.build/pinning/pat/v1'

export const uploadOnPinionBuild: UploadFunction = async ({
  bytes,
  name,
  token,
  verbose,
  first,
  cid,
}) => {
  if (!first) {
    return specPin({ cid, name, token, providerName, baseURL: PINNING_URL })
  }

  const url = new URL(`${UPLOAD_URL}/`)
  url.searchParams.set('format', 'car')
  if (name) url.searchParams.set('name', name)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.ipld.car',
    },
    body: bytes,
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const json = await res.json()

  if (!res.ok)
    throw new DeployError(providerName, json.message ?? 'Upload failed')

  // The upload endpoint always answers with a pin that was just created and
  // handed off to the reconciler (`status: "pinning"`), which isn't one of
  // our `PinStatus` values -- report `queued` here, matching every other
  // provider's upload-time status, and let `statusOnPinionBuild` report the
  // real state.
  return { cid: json.pin?.cid ?? cid, status: 'queued' }
}

export const statusOnPinionBuild: StatusFunction = (args) =>
  specStatus({ ...args, baseURL: PINNING_URL })

export const unpinOnPinionBuild: UnpinFunction = (args) =>
  specUnpin({ baseURL: PINNING_URL, providerName })(args)
