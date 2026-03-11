import { DeployError, UploadNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'

const providerName = 'AIOZ'

export const pinOnAioz: UploadFunction = async ({
  first,
  token,
  verbose,
  name = '',
  cid,
}) => {
  if (first) throw new UploadNotSupportedError(providerName)

  const [apiKey, apiSecret] = token.split(':')
  if (!apiKey || !apiSecret) {
    throw new DeployError(
      providerName,
      'Invalid token format. Expected: api_key:api_secret',
    )
  }

  const res = await fetch('https://api.aiozpin.network/api/pinning/pinByHash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      pinning_api_key: apiKey,
      pinning_secret_key: apiSecret,
    },
    body: JSON.stringify({
      hash_to_pin: cid,
      metadata: {
        name,
      },
    }),
  })

  const json = await res.json()

  if (!res.ok) {
    throw new DeployError(providerName, json.message || 'Pinning failed')
  }

  return { cid: json.data.cid }
}
