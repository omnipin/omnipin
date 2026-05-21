import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import {
  MissingCLIArgsError,
  MissingKeyError,
  UnknownProviderError,
} from '../errors.js'
import { depositFilecoinUsdfc } from '../utils/filecoin-deposit.js'
import { logger } from '../utils/logger.js'

export type DepositActionArgs = Partial<{
  provider: string
  from: Address
  verbose: boolean
}>

/**
 * Providers that have a separate deposit step on top of holding the
 * underlying token. Today only Filecoin has one (Filecoin Pay). AIOZ stores
 * the bill in native AIOZ on the AIOZ Network itself, so `bridge` is the
 * whole flow there.
 */
const SUPPORTED_PROVIDERS = new Set(['Filecoin'])

export const depositAction = async ({
  amount,
  options = {},
}: {
  amount: string
  options: DepositActionArgs
}) => {
  if (!amount) throw new MissingCLIArgsError(['amount'])

  const provider = options.provider
  if (!provider) throw new MissingCLIArgsError(['provider'])
  if (!SUPPORTED_PROVIDERS.has(provider))
    throw new UnknownProviderError(provider)

  const pk = process.env.OMNIPIN_PK as Hex | undefined
  if (!pk) throw new MissingKeyError('PK')

  if (provider === 'Filecoin') {
    logger.start(`Deposit ${amount} USDfc to Filecoin Pay`)

    const result = await depositFilecoinUsdfc({
      privateKey: pk,
      amount,
      from: options.from,
      verbose: options.verbose,
    })

    if (options.verbose) {
      logger.text(JSON.stringify(result, null, 2))
    }
  }
}
