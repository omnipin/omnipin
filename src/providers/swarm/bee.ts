import { DeployError, PinningNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { referenceToCIDString } from '../../utils/swarm.js'

const providerName = 'Bee'

export const uploadOnBee: UploadFunction<{ beeURL: string }> = async ({
  token,
  bytes,
  verbose,
  beeURL,
  first,
}) => {
  if (!first) throw new PinningNotSupportedError(providerName)
  const res = await fetch(`${beeURL}/bzz`, {
    body: new Blob([bytes.buffer as ArrayBuffer]),
    headers: {
      'Swarm-Postage-Batch-Id': token,
      'Content-Type': 'application/x-tar',
      'Swarm-Index-Document': 'index.html',
      'Swarm-Error-Document': 'index.html',
      'Swarm-Collection': 'true',
    },
    method: 'POST',
  })

  const json = await res.json()

  if (verbose) logger.request('POST', res.url, res.status)

  if (!res.ok) {
    throw new DeployError(providerName, json.message)
  }

  return {
    cid: referenceToCIDString(`0x${json.reference}`),
    rID: json.reference,
  }
}
