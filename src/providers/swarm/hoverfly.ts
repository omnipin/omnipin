import * as Address from 'ox/Address'
import * as Secp256k1 from 'ox/Secp256k1'
import { DeployError, PinningNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import {
  callDaemon,
  DEFAULT_HOVERFLY_SOCKET,
} from '../../utils/hoverfly-daemon.js'
import { logger } from '../../utils/logger.js'
import { referenceToCIDString, resolveBatch } from '../../utils/swarm.js'

const providerName = 'Hoverfly'

/** Peer fan-out per chunk, mirroring the `hoverfly upload` default. */
const DEFAULT_MAX_RETRIES = 10
/** Parallel peer sessions, mirroring the `hoverfly upload` default. */
const DEFAULT_CONCURRENCY = 8

/** Derive the Ethereum address of a private key (the batch owner's). */
const addressFromKey = (key: string): string | undefined => {
  const privateKey = `0x${key.replace(/^0x/i, '')}` as `0x${string}`
  try {
    return Address.fromPublicKey(Secp256k1.getPublicKey({ privateKey }))
  } catch {
    return undefined
  }
}

export const uploadOnHoverfly: UploadFunction<{
  key?: string
  path?: string | null
  socket?: string
  rpcUrl?: string
  depth?: number
  immutable?: boolean
  redundancy?: string
  concurrency?: number
  retries?: number
  skipOwnerCheck?: boolean
}> = async ({
  token,
  verbose,
  first,
  key,
  path,
  socket,
  rpcUrl,
  depth,
  immutable,
  redundancy,
  concurrency,
  retries,
  skipOwnerCheck,
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

    // Depth and mutability come from the chain unless the depth is pinned
    // explicitly — a wrong depth silently corrupts the upload.
    let batchDepth = depth
    let batchImmutable = immutable ?? false
    if (batchDepth === undefined) {
      const info = await resolveBatch(batch, rpcUrl)
      batchDepth = info.depth
      batchImmutable = info.immutable
      if (verbose)
        logger.info(
          `${providerName}: batch depth ${info.depth}${info.immutable ? ' (immutable)' : ''}`,
        )

      // A key that doesn't own the batch produces stamps bee rejects
      // ("could not push chunk") — fail fast instead of retrying forever.
      if (!skipOwnerCheck) {
        const owner = addressFromKey(key)
        if (owner && owner.toLowerCase() !== info.owner.toLowerCase()) {
          throw new DeployError(
            providerName,
            `batch owner mismatch: batch ${batch} is owned by ${info.owner} on-chain, but the key derives to ${owner}. Bee will reject every stamp signed by this key. Use the batch owner's key, or set OMNIPIN_HOVERFLY_NO_OWNER_CHECK=1 if you are authorised to sign for it.`,
          )
        }
      }
    } else if (verbose) {
      logger.info(`${providerName}: batch depth ${batchDepth} (from env)`)
    }

    if (verbose) logger.info(`${providerName}: uploading via ${socketPath}…`)
    const startedAt = Date.now()
    let lastReported = 0
    const resp = await callDaemon(
      socketPath,
      {
        op: 'upload',
        file: path,
        batch,
        depth: batchDepth,
        immutable: batchImmutable,
        key: signer,
        max_retries: retries ?? DEFAULT_MAX_RETRIES,
        concurrency: concurrency ?? DEFAULT_CONCURRENCY,
        raw: false,
        collection: true,
        // Ask the daemon to stream chunk progress; it is the only way to
        // tell a slow upload from a stuck one.
        progress: true,
        manifest_path: null,
        content_type: null,
        index_document: 'index.html',
        error_document: 'index.html',
        redundancy: redundancy ?? null,
      },
      (done, total) => {
        if (!verbose) return
        // Throttle: the daemon reports per chunk, uploads have thousands.
        if (done - lastReported < 10 && done !== total) return
        lastReported = done
        const pct = total > 0 ? Math.round((done / total) * 100) : 0
        const secs = Math.round((Date.now() - startedAt) / 1000)
        logger.info(
          `${providerName}: ${done}/${total} chunks (${pct}%) — ${secs}s`,
        )
      },
    )

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
