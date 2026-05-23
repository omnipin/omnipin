import { PROVIDERS } from '../constants.js'
import { AllProvidersFailedError, NoProvidersError } from '../errors.js'
import {
  findEnvVarProviderName,
  parseTokensFromEnv,
  tokensToProviderNames,
} from '../utils/env.js'
import { logger } from '../utils/logger.js'

type UnpinActionArgs = Partial<{
  providers: string
  verbose: boolean
}>

export const unpinAction = async ({
  cid,
  options,
}: {
  options: UnpinActionArgs
  cid: string
}) => {
  logger.info(`Unpinning ${cid}`)

  const apiTokens = parseTokensFromEnv()

  const { providers: providersList, verbose } = options

  const providerNames = providersList
    ? providersList.split(',')
    : tokensToProviderNames(apiTokens.keys())

  const providers = providerNames
    .map((providerName) => PROVIDERS[findEnvVarProviderName(providerName)!])
    .filter((p) => p?.unpin)

  if (!providers.length) throw new NoProvidersError()

  logger.info(
    `Unpinning with providers: ${providers.map((p) => p.name).join(', ')}`,
  )

  const errors: Error[] = []

  for (const provider of providers) {
    const envVar = findEnvVarProviderName(provider.name)!
    const token = apiTokens.get(envVar)!

    try {
      await provider.unpin?.({ cid, token, verbose })
      logger.success(`Unpinned on ${provider.name}`)
    } catch (e) {
      logger.error(`Failed to unpin on ${provider.name}`)
      errors.push(e as Error)
    }
  }

  if (errors.length === providers.length) {
    logger.error('Unpinning failed')
    errors.forEach((e) => {
      logger.error(e)
    })
    throw new AllProvidersFailedError('unpin', errors)
  } else if (errors.length) {
    logger.warn('There were some problems with unpinning')
    errors.forEach((e) => {
      logger.error(e)
    })
  } else {
    logger.success(`Unpinned ${cid} across all providers`)
  }
}
