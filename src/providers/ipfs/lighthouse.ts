import { DeployError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'

const providerName = 'Lighthouse'

export const uploadOnLighthouse: UploadFunction = async ({
  car,
  name,
  first,
  token,
  verbose,
  cid,
}) => {
  if (first) {
    const fd = new FormData()

    fd.append('file', car, `${name}.car`)

    const res = await fetch(
      'https://upload.lighthouse.storage/api/v0/dag/import',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      },
    )

    if (verbose) logger.request('POST', res.url, res.status)

    const json = await res.json()

    if (!res.ok) {
      const message = json.error?.message || json.message || 'Unknown error'
      throw new DeployError(providerName, message)
    }

    return { cid: json.data?.Hash || cid }
  }

  // Pin existing CID
  const res = await fetch('https://api.lighthouse.storage/api/lighthouse/pin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ cid }),
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const json = await res.json()

  if (!res.ok) throw new DeployError(providerName, json.error.message)

  return { cid, status: 'queued' }
}
