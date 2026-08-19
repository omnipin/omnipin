import { DeployError, MissingKeyError } from '../../errors.js'
import type { StatusFunction, UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { uploadOnS3 } from './s3.js'
import { specStatus } from './spec.js'

const providerName = 'Filebase'

// Filebase exposes two distinct APIs and they are not interchangeable:
//
//   - the Kubo-compatible IPFS RPC API, used to pin an existing CID. Every
//     route lives under `/api/v0`, takes POST, and reports errors as
//     `{ Message, Code, Type }`.
//   - the IPFS Pinning Service API (PSA), used to read pin status. It speaks
//     the `/pins` spec that `specStatus` implements, and lives on a different
//     host entirely — the RPC host has no `/pins` route.
const rpcURL = 'https://rpc.filebase.io/api/v0'
const pinningServiceURL = 'https://api.filebase.io/v1/ipfs'

/**
 * Extract a human-readable reason from a Filebase RPC error body.
 *
 * The RPC API answers with `{ Message, Code, Type }`, but proxy and gateway
 * errors come back as HTML or an empty body, so fall back to the raw text and
 * finally to the status line rather than throwing a `TypeError` while building
 * the error message.
 */
const errorMessage = (
  json: { Message?: string; error?: { details?: string } } | undefined,
  text: string,
  res: Response,
): string =>
  json?.Message ??
  json?.error?.details ??
  (text.trim() || `${res.status} ${res.statusText}`)

export const uploadOnFilebase: UploadFunction<{ bucketName: string }> = async ({
  first,
  bytes,
  name,
  token,
  bucketName,
  verbose,
  cid,
  size,
}) => {
  if (first) {
    if (!bucketName) throw new MissingKeyError(`FILEBASE_BUCKET_NAME`)

    const res = await uploadOnS3({
      bucketName,
      apiUrl: 's3.filebase.com',
      providerName,
      verbose,
      name,
      bytes,
      size,
      token,
    })

    return { cid: res.headers.get('x-amz-meta-cid')!, status: 'queued' }
  }

  // `rpcURL` carries a path (`/api/v0`), so it must be interpolated rather
  // than passed as a `new URL(path, base)` base — a root-relative path would
  // discard it and POST to `https://rpc.filebase.io/pin/add`.
  const res = await fetch(new URL(`${rpcURL}/pin/add?arg=${cid}`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (verbose) logger.request('POST', res.url, res.status)

  // Read as text first: error responses are not always JSON, and calling
  // `res.json()` on an HTML gateway page throws before we can report why the
  // pin failed.
  const text = await res.text()
  let json: { Message?: string; Pins?: string[] } | undefined
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }

  if (!res.ok)
    throw new DeployError(providerName, errorMessage(json, text, res))

  // `pin/add` answers with `{ Pins: [cid], Progress }` — there is no status
  // field, so report `queued` (matching the S3 path above) and let
  // `statusOnFilebase` report the real state.
  return { status: 'queued', cid: json?.Pins?.[0] ?? cid }
}

export const statusOnFilebase: StatusFunction = async (args) =>
  specStatus({ ...args, baseURL: pinningServiceURL })
