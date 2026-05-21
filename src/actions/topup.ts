import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { fromEther } from 'ox/Value'
import {
  MissingCLIArgsError,
  MissingKeyError,
  UnknownProviderError,
} from '../errors.js'
import {
  SOURCE_CHAINS,
  type SourceChain,
  topupAioz,
} from '../utils/aioz-bridge.js'
import { logger } from '../utils/logger.js'

export type TopupActionArgs = Partial<{
  provider: string
  'from-chain': string
  to: Address
  'rpc-url': string
  'aioz-rpc-url': string
  verbose: boolean
}>

const SUPPORTED_PROVIDERS = new Set(['AIOZ'])

const isSourceChain = (v: string | undefined): v is SourceChain =>
  typeof v === 'string' && v in SOURCE_CHAINS

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
    if (!isSourceChain(fromChain)) throw new MissingCLIArgsError(['from-chain'])

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
  }
}
