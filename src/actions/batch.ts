import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import {
  MissingCLIArgsError,
  MissingKeyError,
  UnknownProviderError,
} from '../errors.js'
import { logger } from '../utils/logger.js'
import {
  buyBatchViaBee,
  buyBatchViaBeeport,
  DEFAULT_BATCH_DURATION_SECONDS,
  DEFAULT_BATCH_SIZE_BYTES,
  parseDuration,
  parseSize,
} from '../utils/swarm-batch.js'

export type BatchActionArgs = Partial<{
  provider: string
  size: string
  duration: string
  'node-address': Address
  'rpc-url': string
  slippage: string
  verbose: boolean
}>

const SUPPORTED_PROVIDERS = new Set(['Beeport', 'Bee'])

/**
 * Purchase an immutable Swarm postage batch.
 *
 * `--provider=Beeport`: pays native xDAI via Beeport's SushiSwap router. Signs
 *  with `OMNIPIN_BEEPORT_TOKEN` (the same key used to authenticate uploads).
 *
 * `--provider=Bee`:    pays pre-held BZZ via the canonical PostageStamp.
 *  Signs with `OMNIPIN_PK`.
 */
export const batchAction = async ({
  options = {},
}: {
  options: BatchActionArgs
}) => {
  const provider = options.provider
  if (!provider) throw new MissingCLIArgsError(['provider'])
  if (!SUPPORTED_PROVIDERS.has(provider))
    throw new UnknownProviderError(provider)

  const sizeBytes = options.size
    ? parseSize(options.size)
    : DEFAULT_BATCH_SIZE_BYTES
  const durationSeconds = options.duration
    ? parseDuration(options.duration)
    : DEFAULT_BATCH_DURATION_SECONDS

  logger.start(
    `Buying Swarm batch via ${provider} (size=${sizeBytes}B, duration=${durationSeconds}s)`,
  )

  if (provider === 'Beeport') {
    const privateKey = process.env.OMNIPIN_BEEPORT_TOKEN as Hex | undefined
    if (!privateKey) throw new MissingKeyError('BEEPORT_TOKEN')

    const slippage =
      options.slippage !== undefined
        ? Number.parseFloat(options.slippage)
        : undefined
    if (
      slippage !== undefined &&
      (!Number.isFinite(slippage) || slippage < 0 || slippage > 1)
    ) {
      throw new Error(
        `--slippage must be a number in [0, 1] (fraction), got: ${options.slippage}`,
      )
    }

    const result = await buyBatchViaBeeport({
      privateKey,
      sizeBytes,
      durationSeconds,
      nodeAddress: options['node-address'],
      slippage,
      rpcUrl: options['rpc-url'],
      verbose: options.verbose,
    })

    logger.success(`Batch ID: ${result.batchId}`)
    if (options.verbose) {
      logger.text(
        JSON.stringify(
          {
            batchId: result.batchId,
            txHash: result.txHash,
            depth: result.depth,
            bucketDepth: result.bucketDepth,
            initialBalancePerChunk: result.initialBalancePerChunk.toString(),
            totalBzzAmount: result.totalBzzAmount.toString(),
          },
          null,
          2,
        ),
      )
    }
    return
  }

  if (provider === 'Bee') {
    const privateKey = process.env.OMNIPIN_PK as Hex | undefined
    if (!privateKey) throw new MissingKeyError('PK')

    const result = await buyBatchViaBee({
      privateKey,
      sizeBytes,
      durationSeconds,
      nodeAddress: options['node-address'],
      rpcUrl: options['rpc-url'],
      verbose: options.verbose,
    })

    logger.success(`Batch ID: ${result.batchId}`)
    if (options.verbose) {
      logger.text(
        JSON.stringify(
          {
            batchId: result.batchId,
            txHash: result.txHash,
            depth: result.depth,
            bucketDepth: result.bucketDepth,
            initialBalancePerChunk: result.initialBalancePerChunk.toString(),
            totalBzzAmount: result.totalBzzAmount.toString(),
          },
          null,
          2,
        ),
      )
    }
  }
}
