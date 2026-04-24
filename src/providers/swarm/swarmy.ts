import { DeployError, PinningNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { referenceToCIDString } from '../../utils/swarm.js'

const providerName = 'Swarmy'

export const uploadOnSwarmy: UploadFunction = async ({
  token,
  bytes,
  verbose,
  first,
}) => {
  if (!first) throw new PinningNotSupportedError(providerName)
  const body = new FormData()
  body.append('file', new Blob([bytes.buffer as ArrayBuffer]))
  const res = await fetch('https://api.swarmy.cloud/api/files?website=true', {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method: 'POST',
  })

  const json = await res.json()

  if (verbose) logger.request('POST', res.url, res.status)

  if (!res.ok) {
    throw new DeployError(providerName, json.message)
  }

  return {
    cid: referenceToCIDString(`0x${json.swarmReference}`),
    rID: json.swarmReference,
  }
}
