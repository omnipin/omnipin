import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeployError, PinningNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import {
  callDaemon,
  DEFAULT_HOVERFLY_SOCKET,
} from '../../utils/hoverfly-daemon.js'
import { logger } from '../../utils/logger.js'
import { referenceToCIDString, resolveBatchDepth } from '../../utils/swarm.js'

const providerName = 'Hoverfly'

/**
 * Swarm upload via a running `hoverfly daemon` over its UNIX socket — no bee
 * node, no remote API. The daemon holds a warm libp2p session pool and the node
 * identity/overlay, so a single deploy is one fast framed request instead of
 * paying the cold pool-fill + overlay-placement cost in-process.
 *
 * Start the daemon first (it picks up `peers.json` + `overlay-nonce` from its
 * working dir; see hoverfly's README):
 *
 *   hoverfly daemon --socket /tmp/hoverfly.sock --pool-size 256 \
 *     --identity 0xKEY --peerlist peers.json
 *
 * Then point omnipin at it with `OMNIPIN_HOVERFLY_TOKEN` (postage batch),
 * `OMNIPIN_HOVERFLY_KEY` (signer), and optionally `OMNIPIN_HOVERFLY_SOCKET`.
 */
export const uploadOnHoverfly: UploadFunction<{
  key?: string
  socket?: string
  rpcUrl?: string
  depth?: number
  concurrency?: number
  retries?: number
}> = async ({
  token,
  bytes,
  verbose,
  first,
  key,
  socket,
  rpcUrl,
  depth,
  concurrency,
  retries,
}) => {
  if (!first) throw new PinningNotSupportedError(providerName)
  if (!key)
    throw new DeployError(providerName, 'OMNIPIN_HOVERFLY_KEY is missing')

  const socketPath = socket ?? DEFAULT_HOVERFLY_SOCKET
  const batch = token.replace(/^0x/i, '')
  const signer = key.replace(/^0x/i, '')

  let tmpDir: string | undefined
  try {
    // Verify the daemon is up before doing any work.
    const pong = await callDaemon(socketPath, { op: 'ping' }).catch(() => {
      throw new DeployError(
        providerName,
        `no hoverfly daemon at ${socketPath} — start one with \`hoverfly daemon --socket ${socketPath} --identity 0x${signer} --peerlist peers.json\``,
      )
    })
    if (pong.status !== 'pong') {
      throw new DeployError(providerName, 'unexpected daemon ping response')
    }

    const batchDepth = depth ?? (await resolveBatchDepth(batch, rpcUrl))
    if (verbose) logger.info(`${providerName}: batch depth ${batchDepth}`)

    // The daemon reads the upload from a file path (client and daemon share a
    // filesystem), so persist the packed TAR to a temp file. `.tar` +
    // `collection: true` makes the daemon serve it as a browsable website.
    tmpDir = await mkdtemp(join(tmpdir(), 'omnipin-hoverfly-'))
    const tarPath = join(tmpDir, 'site.tar')
    await writeFile(tarPath, bytes)

    if (verbose) logger.info(`${providerName}: uploading via ${socketPath}…`)
    // A large site can take minutes to push; the daemon streams progress to its
    // own log, but the single socket response looks like a hang from here. Emit
    // an elapsed-time heartbeat in verbose mode so it's clearly alive.
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
        file: tarPath,
        batch,
        depth: batchDepth,
        key: signer,
        max_retries: retries ?? 60,
        // The dispatcher fans out across this many sessions. The daemon's pool
        // fills toward its --pool-size (e.g. 256), but a low request concurrency
        // caps the live session set — hardcoding 8 left the pool stuck at
        // `pool=8 eligible=0` on large uploads. Match the recommended pool size.
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
  } finally {
    if (tmpDir)
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
