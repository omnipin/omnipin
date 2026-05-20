import { base64pad } from 'multiformats/bases/base64'
import { DeployError } from '../../errors.js'
import type { PinStatus, StatusFunction, UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'

const providerName = 'IPFSNinja'

const API_URL = 'https://api.ipfs.ninja'

export const uploadOnIpfsNinja: UploadFunction = async ({
  bytes,
  name,
  first,
  token,
  verbose,
  cid,
}) => {
  if (first) {
    const res = await fetch(`${API_URL}/upload/new`, {
      method: 'POST',
      headers: {
        'X-Api-Key': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: base64pad.baseEncode(bytes),
        car: true,
        description: name,
      }),
    })

    if (verbose) logger.request('POST', res.url, res.status)

    const json = await res.json()

    if (!res.ok)
      throw new DeployError(
        providerName,
        json.error?.message || json.error || 'Unknown error',
      )

    return { cid: json.cid ?? cid }
  }

  // Pin existing CID
  const res = await fetch(`${API_URL}/pin`, {
    method: 'POST',
    headers: {
      'X-Api-Key': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cid, description: name }),
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const json = await res.json()

  if (!res.ok)
    throw new DeployError(
      providerName,
      json.error?.message || json.error || 'Unknown error',
    )

  return { cid, status: 'queued' }
}

export const statusOnIpfsNinja: StatusFunction = async ({
  cid,
  auth,
  verbose,
}) => {
  const res = await fetch(`${API_URL}/pin/${cid}`, {
    headers: {
      'X-Api-Key': auth.token ?? '',
    },
  })

  if (verbose) logger.request('GET', res.url, res.status)

  if (res.status === 404) return { pin: 'not pinned' }

  const json = await res.json()

  if (!res.ok)
    throw new DeployError(
      providerName,
      json.error?.message || json.error || 'Unknown error',
    )

  const pin: PinStatus =
    json.status === 'pinned'
      ? 'pinned'
      : json.status === 'pinning'
        ? 'queued'
        : json.status === 'failed'
          ? 'failed'
          : 'unknown'

  return { pin }
}
