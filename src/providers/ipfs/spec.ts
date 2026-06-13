import { DeployError, UploadNotSupportedError } from '../../errors.js'
import type { PinFunction, StatusFunction, UnpinFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'

type SpecPinFunction = PinFunction<{ baseURL: string; providerName: string }>

export const specPin: SpecPinFunction = async ({
  baseURL,
  providerName,
  cid,
  name,
  token,
  first,
  verbose,
}) => {
  if (first) throw new UploadNotSupportedError(providerName)

  const res = await fetch(new URL(`${baseURL}/pins`), {
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

  return { status: json.status, cid: json?.pin?.cid ?? json.Pins[0] }
}

export const specStatus: StatusFunction<{ baseURL: string }> = async ({
  cid,
  baseURL,
  auth,
  verbose,
}) => {
  const res = await fetch(`${baseURL}/pins?cid=${cid}&limit=1`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  })

  if (verbose) logger.request('GET', res.url, res.status)

  const json = await res.json()

  if (res.status === 404 || json.count === 0) return { pin: 'not pinned' }
  else if (!res.ok) throw new Error(json.error?.details ?? json)

  return {
    pin: json.results[0].status,
  }
}

export const specUnpin = (config: {
  baseURL: string
  providerName: string
}): UnpinFunction => {
  return async ({ cid, token, verbose }) => {
    const listRes = await fetch(`${config.baseURL}/pins?cid=${cid}&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (verbose) logger.request('GET', listRes.url, listRes.status)

    if (listRes.status === 404) return { success: true, cid }

    const listJson = await listRes.json()

    if (!listRes.ok)
      throw new DeployError(
        config.providerName,
        listJson.error?.details ?? 'List pins failed',
      )

    if (listJson.count === 0) return { success: true, cid }

    const requestId = listJson.results[0].requestid

    const delRes = await fetch(`${config.baseURL}/pins/${requestId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (verbose) logger.request('DELETE', delRes.url, delRes.status)

    if (delRes.status === 404) return { success: true, cid }
    if (!delRes.ok) {
      const delJson = await delRes.json().catch(() => ({}))
      throw new DeployError(
        config.providerName,
        delJson.error?.details ?? 'Unpin failed',
      )
    }

    return { success: true, cid }
  }
}
