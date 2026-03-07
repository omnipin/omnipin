import { pluginRegistry } from '../cli.js'
import { isTTY, PROVIDERS } from '../constants.js'
import { AsciiBar } from '../deps.js'
import { NoProvidersError } from '../errors.js'
import {
  findEnvVarProviderName,
  parseTokensFromEnv,
  tokensToProviderNames,
} from '../utils/env.js'
import { deployMessage, logger } from '../utils/logger.js'

type PinActionArgs = Partial<{
  providers: string
  strict: boolean
  verbose: boolean
}>

export const pinAction = async ({
  cid,
  options,
}: {
  options: PinActionArgs
  cid: string
}) => {
  // Run before hooks
  const beforeCtx = await pluginRegistry.runBefore('pin', { cid, options })
  cid = beforeCtx.cid
  options = beforeCtx.options

  logger.info(`Pinning ${cid}`)

  const apiTokens = parseTokensFromEnv()

  const { providers: providersList, verbose, strict } = options

  const providerNames = providersList
    ? providersList.split(',')
    : tokensToProviderNames(apiTokens.keys())

  const providers = providerNames
    .map((providerName) => PROVIDERS[findEnvVarProviderName(providerName)!])
    .filter((p) => p.supported === 'both' || p.supported === 'pin')
    .sort((a) => {
      if (a.supported === 'both' || a.supported === 'upload') return -1
      else return 1
    })

  if (!providers.length) throw new NoProvidersError()

  logger.info(
    `Deploying with providers: ${providers.map((p) => p.name).join(', ')}`,
  )

  let total = 0

  const bar = isTTY
    ? new AsciiBar({
        total: providers.length,
        hideCursor: false,
        enableSpinner: true,
        width: process.stdout.columns - 30,
      })
    : undefined

  const errors: Error[] = []
  let result: {
    cid: string
    succeeded: string[]
    failed: Array<{ provider: string; error: Error }>
  }

  for (const provider of providers) {
    const envVar = findEnvVarProviderName(provider.name)!
    const token = apiTokens.get(envVar)!

    bar?.update(total++, deployMessage(provider.name, 'pin'))

    try {
      await PROVIDERS[envVar].upload({
        token,
        cid,
        first: false,
        verbose,
        baseURL: apiTokens.get('SPEC_URL'),
        chain: apiTokens.get('ALEPH_CHAIN') || 'ETH',
      })
    } catch (e) {
      if (strict) throw e
      else errors.push(e as Error)
    }
  }
  bar?.update(total)

  if (errors.length === providers.length) {
    logger.error('Pinning failed')
    errors.forEach((e) => {
      logger.error(e)
    })
    result = {
      cid,
      succeeded: [],
      failed: errors.map((e) => ({ provider: 'unknown', error: e })),
    }
  } else if (errors.length) {
    logger.warn('There were some problems with pinning')
    errors.forEach((e) => {
      logger.error(e)
    })
    result = {
      cid,
      succeeded: providers
        .filter((p) => !errors.some((e) => e.message.includes(p.name)))
        .map((p) => p.name),
      failed: errors.map((e) => ({ provider: 'unknown', error: e })),
    }
  } else {
    logger.success('Pinned across all providers')
    result = { cid, succeeded: providers.map((p) => p.name), failed: [] }
  }

  // Run after hooks
  await pluginRegistry.runAfter('pin', { ...beforeCtx, ...result })
}
