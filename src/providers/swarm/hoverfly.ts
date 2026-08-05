import { DeployError, PinningNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import {
  callDaemon,
  DEFAULT_HOVERFLY_SOCKET,
} from '../../utils/hoverfly-daemon.js'
import { logger } from '../../utils/logger.js'
import { referenceToCIDString, resolveBatchDepth } from '../../utils/swarm.js'

const providerName = 'Hoverfly'

export const uploadOnHoverfly: UploadFunction<{
  key?: string
  path?: string | null
  socket?: string
  rpcUrl?: string
  depth?: number
  concurrency?: number
  retries?: number
}> = async ({
  token,
  verbose,
  first,
  key,
  path,
  socket,
  rpcUrl,
  depth,
  concurrency,
  retries,
}) => {
  if (!first) throw new PinningNotSupportedError(providerName)
  if (!key)
    throw new DeployError(providerName, 'OMNIPIN_HOVERFLY_KEY is missing')
  // The daemon's upload op takes the packed `.tar` by path; `deploy` writes it
  // via `packAction` and passes it through.
  if (!path) throw new DeployError(providerName, 'missing packed TAR path')

  const socketPath = socket ?? DEFAULT_HOVERFLY_SOCKET
  const batch = token.replace(/^0x/i, '')
  const signer = key.replace(/^0x/i, '')

  try {
    const pong = await callDaemon(socketPath, { op: 'ping' }).catch(() => {
      throw new DeployError(
        providerName,
        `no hoverfly daemon at ${socketPath} — start one with \`hoverfly daemon --socket ${socketPath}\``,
      )
    })
    if (pong.status !== 'pong') {
      throw new DeployError(providerName, 'unexpected daemon ping response')
    }

    const batchDepth = depth ?? (await resolveBatchDepth(batch, rpcUrl))
    if (verbose) logger.info(`${providerName}: batch depth ${batchDepth}`)

    if (verbose) logger.info(`${providerName}: uploading via ${socketPath}…`)
    const startedAt = Date.now()
    const heartbeat = verbose
      ? setInterval(() => {
          const secs = Math.round((Date.now() - startedAt) / 1000)
          logger.info(`${providerName}: still uploading (${secs}s)…`)
        }, 15_000)
      : undefined
    let resp: Awaited<ReturnType<typeof callDaemon>>
    try {
      resp = await callDaemon(socketPath, {
        op: 'upload',
        file: path,
        batch,
        depth: batchDepth,
        key: signer,
        max_retries: retries ?? 60,
        concurrency: concurrency ?? 256,
        raw: false,
        collection: true,
        manifest_path: null,
        content_type: null,
        index_document: 'index.html',
        error_document: 'index.html',
      })
    } finally {
      if (heartbeat) clearInterval(heartbeat)
    }

    if (resp.status === 'err') {
      throw new DeployError(providerName, resp.message)
    }
    if (resp.status !== 'uploaded') {
      throw new DeployError(
        providerName,
        `unexpected daemon response: ${resp.status}`,
      )
    }

    return {
      cid: referenceToCIDString(`0x${resp.root}`),
      rID: resp.root,
    }
  } catch (e) {
    if (e instanceof PinningNotSupportedError || e instanceof DeployError)
      throw e
    throw new DeployError(providerName, (e as Error).message, { cause: e })
  }
}
