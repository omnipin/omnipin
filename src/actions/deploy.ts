import { isTTY, PROVIDERS } from '../constants.js'
import { AsciiBar, styleText } from '../deps.js'
import { MissingKeyError, NoProvidersError } from '../errors.js'
import {
  findEnvVarProviderName,
  parseTokensFromEnv,
  tokensToProviderNames,
} from '../index.js'
import { deployMessage, logger } from '../utils/logger.js'
import { dnsLinkAction } from './dnslink.js'
import { type EnsActionArgs, ensAction } from './ens.js'
import { type PackActionArgs, packAction } from './pack.js'

export type DeployActionArgs = Partial<{
  strict: boolean
  ens: string
  providers: string
  dnslink: string
  'progress-bar': boolean
  'filecoin-chain': 'mainnet' | 'calibration'
}> &
  PackActionArgs &
  EnsActionArgs

export const deployAction = async ({
  dir,
  options = {},
}: {
  dir?: string
  options?: DeployActionArgs
}) => {
  const {
    strict,
    ens,
    chain = 'mainnet',
    name: customName,
    dist,
    verbose = false,
    providers: providersList,
    dnslink,
    'progress-bar': progressBar,
    'filecoin-chain': filecoinChain,
    ...opts
  } = options

  const apiTokens = parseTokensFromEnv()

  const providerNames = providersList
    ? providersList.split(',')
    : tokensToProviderNames(apiTokens.keys())

  const allProviders = providerNames.map((providerName) => {
    const envVarName = findEnvVarProviderName(providerName)!
    return PROVIDERS[envVarName]
  })

  const ipfsProviders = allProviders.filter((p) => p.protocol === 'ipfs')
  const swarmProviders = allProviders.filter((p) => p.protocol === 'swarm')

  ipfsProviders.sort((a) => {
    if (a.supported === 'both' || a.supported === 'upload') return -1
    else return 1
  })

  if (!allProviders.length) throw new NoProvidersError()

  logger.info(
    `Deploying with providers: ${(swarmProviders.length
      ? swarmProviders
      : ipfsProviders
    )
      .map((p) => p.name)
      .join(', ')}`,
  )

  let cid: string = undefined!

  const {
    name,
    cid: ipfsCid,
    blob,
    size,
  } = await packAction({
    dir,
    options: {
      name: customName,
      dist,
      verbose,
      tar: swarmProviders.length !== 0,
    },
  })

  if (swarmProviders.length === 0) cid = ipfsCid!

  let total = 0

  const errors: Error[] = []
  const bar =
    isTTY && progressBar
      ? new AsciiBar({
          total:
            swarmProviders.length !== 0
              ? swarmProviders.length
              : ipfsProviders.length,
          formatString: '#spinner #bar #message',
          hideCursor: false,
          enableSpinner: true,
          width: process.stdout.columns - 30,
        })
      : undefined

  let swarmCid = ''
  if (swarmProviders.length !== 0) {
    for (const provider of swarmProviders) {
      bar?.update(total++, deployMessage(provider.name, provider.supported))
      const envVar = findEnvVarProviderName(provider.name)!
      try {
        const result = await provider.upload({
          car: blob,
          token: apiTokens.get(envVar)!,
          verbose,
          name: '',
          first: true,
          beeURL: apiTokens.get('BEE_URL'),
        })
        swarmCid = result.cid
        cid = result.rID!
      } catch (e) {
        if (strict) throw e
        else errors.push(e as Error)
      }

      bar?.update(total)
    }
  } else {
    for (const provider of ipfsProviders) {
      const envVar = findEnvVarProviderName(provider.name)!
      const token = apiTokens.get(envVar)!

      bar?.update(total++, deployMessage(provider.name, provider.supported))

      let bucketName: string | undefined

      if (envVar.includes('FILEBASE'))
        bucketName = apiTokens.get('FILEBASE_BUCKET_NAME')
      else if (envVar.includes('4EVERLAND'))
        bucketName = apiTokens.get('4EVERLAND_BUCKET_NAME')

      // Filecoin
      const providerURL = apiTokens.get('FILECOIN_SP_URL'),
        providerAddress = apiTokens.get('FILECOIN_SP_ADDRESS'),
        pieceCid = apiTokens.get('FILECOIN_PIECE_CID')

      if (filecoinChain && !providerURL)
        throw new MissingKeyError('FILECOIN_SP_URL')

      try {
        await provider.upload({
          name,
          car: blob,
          token,
          bucketName,
          proof: apiTokens.get('STORACHA_PROOF'),
          cid,
          first: ipfsProviders.indexOf(provider) === 0,
          verbose,
          baseURL: apiTokens.get('SPEC_URL'),
          size,

          // Filecoin
          providerURL,
          providerAddress,
          pieceCid,
          filecoinChain,
        })
      } catch (e) {
        if (strict) throw e
        else errors.push(e as Error)
      }
    }
    bar?.update(total)
  }

  if (
    errors.length !== 0 &&
    (errors.length === ipfsProviders.length ||
      errors.length === swarmProviders.length)
  ) {
    logger.error('Deploy failed')
    errors.forEach((e) => {
      logger.error(e)
    })
    return
  } else if (errors.length) {
    logger.warn('There were some problems with deploying')
    errors.forEach((e) => {
      logger.error(e)
    })
  } else logger.success('Deployed across all providers')

  if (swarmCid) {
    logger.success('Deployed on Swarm')
    logger.info(`Swarm Reference ID: ${cid}`)
    console.log(`\nOpen in a browser: https://${swarmCid}.bzz.limo/ `)
  } else {
    const dwebLink = `https://${cid}.ipfs.dweb.link`
    const providersLink = `https://delegated-ipfs.dev/routing/v1/providers/${cid}`

    console.log(
      `\nOpen in a browser:\n${isTTY ? styleText('bold', 'IPFS') : 'IPFS'}:      ${
        isTTY ? styleText('underline', dwebLink) : dwebLink
      }\n${isTTY ? styleText('bold', 'Providers') : 'Providers'}: ${
        isTTY ? styleText('underline', providersLink) : providersLink
      }`,
    )
  }

  if (typeof ens === 'string') {
    console.log('\n')
    await ensAction({
      cid,
      domain: ens,
      options: { ...opts, chain, verbose },
    })
  }

  if (dnslink) {
    if (swarmProviders.length)
      throw new Error('DNSLink is not supported with Swarm')
    await dnsLinkAction({ cid, name: dnslink, options: { verbose } })
  }
}
