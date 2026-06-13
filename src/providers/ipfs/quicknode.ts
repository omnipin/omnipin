import { DeployError, UploadNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'

const providerName = 'QuickNode'

export const pinOnQuicknode: UploadFunction = async ({
  first,
  token,
  verbose,
  name = '',
  ...args
}) => {
  if (first) throw new UploadNotSupportedError(providerName)

  const res = await fetch('https://api.quicknode.com/ipfs/rest/v1/pinning', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
    },
    body: JSON.stringify({
      cid: args.cid,
      name,
    }),
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const json = await res.json()
  if (!res.ok) throw new DeployError(providerName, json.message)

  return { status: json.status, cid: json.pin.cid }
}
