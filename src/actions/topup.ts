import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { fromEther } from 'ox/Value'
import {
  MissingCLIArgsError,
  MissingKeyError,
  UnknownProviderError,
} from '../errors.js'
import {
  SOURCE_CHAINS as AIOZ_SOURCE_CHAINS,
  type SourceChain as AiozSourceChain,
  topupAioz,
} from '../utils/aioz-bridge.js'
import {
  isSourceChainKey as isFilecoinSourceChainKey,
  topupFilecoin,
} from '../utils/filecoin-topup.js'
import { logger } from '../utils/logger.js'

export type TopupActionArgs = Partial<{
  provider: string
  'from-chain': string
  'from-token': string
  to: Address
  'rpc-url': string
  'aioz-rpc-url': string
  'fil-ratio': string
  slippage: string
  verbose: boolean
}>

const SUPPORTED_PROVIDERS = new Set(['AIOZ', 'Filecoin'])

const isAiozSourceChain = (v: string | undefined): v is AiozSourceChain =>
  typeof v === 'string' && v in AIOZ_SOURCE_CHAINS

export const topupAction = async ({
  amount,
  options = {},
}: {
  amount: string
  options: TopupActionArgs
}) => {
  if (!amount) throw new MissingCLIArgsError(['amount'])

  const provider = options.provider
  if (!provider) throw new MissingCLIArgsError(['provider'])
  if (!SUPPORTED_PROVIDERS.has(provider))
    throw new UnknownProviderError(provider)

  const pk = process.env.OMNIPIN_PK as Hex | undefined
  if (!pk) throw new MissingKeyError('PK')

  if (provider === 'AIOZ') {
    const fromChain = options['from-chain']?.toLowerCase()
    if (!isAiozSourceChain(fromChain))
      throw new MissingCLIArgsError(['from-chain'])

    let amountWei: bigint
    try {
      amountWei = fromEther(amount)
    } catch {
      throw new Error(`Invalid amount: ${amount}`)
    }
    if (amountWei <= 0n) throw new Error(`Amount must be positive: ${amount}`)

    logger.start(`Top-up ${amount} AIOZ via ${provider} bridge`)

    const result = await topupAioz({
      privateKey: pk,
      fromChain,
      amountWei,
      to: options.to,
      verbose: options.verbose,
      sourceRpcUrl: options['rpc-url'],
      aiozRpcUrl: options['aioz-rpc-url'],
    })

    logger.success('Top-up complete')
    if (options.verbose) {
      logger.text(JSON.stringify(result, null, 2))
    }
    return
  }

  if (provider === 'Filecoin') {
    const fromChain = options['from-chain']?.toLowerCase()
    if (!isFilecoinSourceChainKey(fromChain))
      throw new MissingCLIArgsError(['from-chain'])

    const fromToken = options['from-token']
    if (!fromToken) throw new MissingCLIArgsError(['from-token'])

    const filRatio =
      options['fil-ratio'] !== undefined
        ? Number.parseFloat(options['fil-ratio'])
        : 0.1
    if (!Number.isFinite(filRatio) || filRatio < 0 || filRatio > 1) {
      throw new Error(
        `--fil-ratio must be a number in [0, 1], got: ${options['fil-ratio']}`,
      )
    }

    const slippage =
      options.slippage !== undefined ? Number.parseFloat(options.slippage) : 1
    if (!Number.isFinite(slippage) || slippage <= 0 || slippage > 50) {
      throw new Error(
        `--slippage must be a positive number ≤ 50 (percent), got: ${options.slippage}`,
      )
    }

    const result = await topupFilecoin({
      privateKey: pk,
      fromChain,
      fromToken,
      amount,
      to: options.to,
      filRatio,
      slippage,
      sourceRpcUrl: options['rpc-url'],
      verbose: options.verbose,
    })

    if (options.verbose) {
      logger.text(JSON.stringify(result, null, 2))
    }
  }
}
