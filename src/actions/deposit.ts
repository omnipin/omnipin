import { type Address, fromPublicKey } from 'ox/Address'
import { getPublicKey } from 'ox/Secp256k1'
import { MissingCLIArgsError, UnknownProviderError } from '../errors.js'
import { resolveFulaSignerKey, resolveSignerKey } from '../utils/env.js'
import { depositFilecoinUsdfc } from '../utils/filecoin-deposit.js'
import {
  depositFula,
  detectFulaChain,
  type FulaChainKey,
  isFulaChainKey,
} from '../utils/fula-deposit.js'
import { logger } from '../utils/logger.js'

export type DepositActionArgs = Partial<{
  provider: string
  from: Address
  chain: string
  to: Address
  'rpc-url': string
  verbose: boolean
}>

/**
 * Providers that have a separate deposit step on top of holding the
 * underlying token:
 *
 * - **Filecoin** — moves USDfc into Filecoin Pay.
 * - **Fula** — transfers $FULA to Fula's payment vault (Fula has no chain of
 *   its own; $FULA is an ERC-20 on Ethereum and Base).
 *
 * AIOZ stores the bill in native AIOZ on the AIOZ Network itself, so `bridge`
 * is the whole flow there.
 */
const SUPPORTED_PROVIDERS = new Set(['Filecoin', 'Fula'])

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

  if (provider === 'Fula') {
    const pk = resolveFulaSignerKey()

    let chain: FulaChainKey
    if (options.chain) {
      // Explicit override: validate it.
      const requested = options.chain.toLowerCase()
      if (!isFulaChainKey(requested))
        throw new Error(
          `Unsupported chain "${options.chain}" for Fula deposit. Supported: eth, base.`,
        )
      chain = requested
    } else {
      // Auto-detect: deposit from the chain where the signer holds $FULA.
      const signer = fromPublicKey(getPublicKey({ privateKey: pk }))
      const detected = await detectFulaChain({
        owner: signer,
        verbose: options.verbose,
      })
      if (detected) {
        chain = detected
        logger.info(`Using ${chain} (holds $FULA); override with --chain`)
      } else {
        chain = 'eth'
        logger.info(
          'No $FULA balance found on eth or base; defaulting to eth. Override with --chain.',
        )
      }
    }

    const result = await depositFula({
      privateKey: pk,
      amount,
      chain,
      to: options.to,
      rpcUrl: options['rpc-url'],
      verbose: options.verbose,
    })

    if (options.verbose) {
      logger.text(JSON.stringify(result, null, 2))
    }
    return
  }

  const pk = resolveSignerKey(provider)

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
