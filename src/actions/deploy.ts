import { isTTY, PROVIDERS } from '../constants.js'
import { AsciiBar, styleText } from '../deps.js'
import { AllProvidersFailedError, NoProvidersError } from '../errors.js'
import {
  findEnvVarProviderName,
  parseBoolean,
  parseNumber,
  parseTokensFromEnv,
  tokensToProviderNames,
} from '../utils/env.js'
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
  'skip-pinned': boolean
  'filecoin-chain': 'mainnet' | 'calibration'
  'filecoin-force-new-dataset': boolean
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
    'skip-pinned': skipPinned,
    'filecoin-chain': filecoinChain,
    'filecoin-force-new-dataset': filecoinForceNewDataset,
    ...opts
  } = options

  const apiTokens = parseTokensFromEnv()

  const providerNames = providersList
    ? providersList.split(',')
    : tokensToProviderNames(apiTokens.keys())

  const allProviders = providerNames.map((providerName) => {
    const envVarName = findEnvVarProviderName(providerName)
    return PROVIDERS[envVarName]
  })

  let ipfsProviders = allProviders.filter((p) => p.protocol === 'ipfs')
  const swarmProviders = allProviders.filter((p) => p.protocol === 'swarm')

  ipfsProviders = ipfsProviders.toSorted((a, b) => {
    const aPrio = a.supported === 'both' || a.supported === 'upload' ? 0 : 1
    const bPrio = b.supported === 'both' || b.supported === 'upload' ? 0 : 1
    return aPrio - bPrio
  })

  if (!allProviders.length) throw new NoProvidersError()

  // A site cannot go to both protocols at once, so Swarm wins when present and
  // the IPFS providers are ignored (see docs/docs/swarm.md). Everything that
  // counts providers — the log line, the progress bar total, and the
  // all-failed check — must look at this set, not at whichever tokens happen
  // to be sitting in the environment.
  const activeProviders = swarmProviders.length ? swarmProviders : ipfsProviders

  logger.info(
    `Deploying with providers: ${activeProviders.map((p) => p.name).join(', ')}`,
  )

  let cid: string = undefined!

  const {
    name,
    cid: ipfsCid,
    bytes,
    size,
    path: tarPath,
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

  // Providers that already pin this CID and can be skipped. Only a definite
  // 'pinned' counts — 'queued' can still fail — and a failed status check
  // means "unknown", so that provider is deployed to normally instead of
  // skipped. Status failures are deliberately kept out of `errors` and away
  // from --strict: a flaky status endpoint must never fail an otherwise fine
  // deploy. Swarm is exempt because Bee and Swarmy replicate content
  // themselves; only IPFS pins need manual replication.
  const skipped = new Set<(typeof ipfsProviders)[number]>()

  if (skipPinned) {
    if (swarmProviders.length !== 0) {
      logger.warn('skip-pinned has no effect on Swarm deploys and is ignored')
    } else {
      const checkable = ipfsProviders.filter((p) => p.status)
      const results = await Promise.allSettled(
        checkable.map((provider) =>
          provider.status!({
            cid,
            auth: {
              token: apiTokens.get(findEnvVarProviderName(provider.name)),
            },
            verbose,
            baseURL: apiTokens.get('SPEC_URL'),

            // Filecoin: PDP lookups are keyed by the piece CID, which is
            // derived from the packed CAR bytes.
            bytes,
            pieceCid: apiTokens.get('FILECOIN_PIECE_CID'),
            providerURL: apiTokens.get('FILECOIN_SP_URL'),
            providerAddress: apiTokens.get('FILECOIN_SP_ADDRESS'),
            filecoinChain,
          }),
        ),
      )
      for (const [i, result] of results.entries()) {
        const provider = checkable[i]
        if (result.status === 'fulfilled' && result.value.pin === 'pinned') {
          skipped.add(provider)
          logger.info(`Skipping ${provider.name} (already pinned)`)
        } else if (result.status === 'rejected' && verbose)
          logger.warn(
            `Could not check pin status on ${provider.name}, deploying anyway:`,
            result.reason,
          )
      }
    }
  }

  let total = 0

  const errors: Error[] = []
  const bar =
    isTTY && progressBar
      ? new AsciiBar({
          total: activeProviders.length,
          hideCursor: false,
          enableSpinner: true,
          width: process.stdout.columns - 30,
        })
      : undefined

  let swarmCid = ''
  if (swarmProviders.length !== 0) {
    for (const provider of swarmProviders) {
      bar?.update(total++, deployMessage(provider.name, provider.supported))
      const envVar = findEnvVarProviderName(provider.name)
      try {
        const result = await provider.upload({
          bytes,
          token: apiTokens.get(envVar)!,
          verbose,
          name: '',
          first: true,
          beeURL: apiTokens.get('BEE_URL'),
          // Hoverfly talks to a local `hoverfly daemon` over its UNIX socket.
          // Its options (including the signer key) are only handed to the
          // Hoverfly provider itself.
          ...(envVar === 'HOVERFLY_TOKEN'
            ? {
                key: apiTokens.get('HOVERFLY_KEY'),
                path: tarPath,
                socket: apiTokens.get('HOVERFLY_SOCKET'),
                rpcUrl: apiTokens.get('HOVERFLY_RPC_URL'),
                depth: parseNumber(apiTokens.get('HOVERFLY_DEPTH')),
                immutable: parseBoolean(apiTokens.get('HOVERFLY_IMMUTABLE')),
                redundancy: apiTokens.get('HOVERFLY_REDUNDANCY'),
                concurrency: parseNumber(apiTokens.get('HOVERFLY_CONCURRENCY')),
                retries: parseNumber(apiTokens.get('HOVERFLY_RETRIES')),
                skipOwnerCheck: parseBoolean(
                  apiTokens.get('HOVERFLY_NO_OWNER_CHECK'),
                ),
              }
            : {}),
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
    // When at least one provider already pins the CID, the content is
    // retrievable over IPFS, so nobody *has* to receive the raw bytes — hand
    // them to the first non-skipped provider that can take an upload (if
    // any) and let the rest pin by CID. When nothing is skipped this must
    // stay ipfsProviders[0]: with an all-pin-only provider list, index 0
    // still gets first: true today (e.g. 4EVERLAND uploads bytes on first
    // despite supported: 'pin').
    const uploader = skipped.size
      ? ipfsProviders.find(
          (p) =>
            !skipped.has(p) &&
            (p.supported === 'both' || p.supported === 'upload'),
        )
      : ipfsProviders[0]

    for (const provider of ipfsProviders) {
      if (skipped.has(provider)) {
        bar?.update(total++, `⏭ ${provider.name} (already pinned)`)
        continue
      }

      const envVar = findEnvVarProviderName(provider.name)
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

      try {
        await provider.upload({
          name,
          bytes,
          token,
          bucketName,
          cid,
          first: provider === uploader,
          verbose,
          baseURL: apiTokens.get('SPEC_URL'),
          size,

          // Filecoin
          providerURL,
          providerAddress,
          pieceCid,
          filecoinChain,
          filecoinForceNewDataset,
        })
      } catch (e) {
        if (strict) throw e
        else errors.push(e as Error)
      }
    }
    bar?.update(total)
  }

  // Compare against providers actually attempted: skipped providers can
  // neither fail nor rescue a deploy where everything attempted failed.
  const attempted = activeProviders.length - skipped.size
  if (errors.length !== 0 && errors.length === attempted) {
    logger.error('Deploy failed')
    errors.forEach((e) => {
      logger.error(e)
    })
    throw new AllProvidersFailedError('deploy', errors)
  } else if (errors.length) {
    logger.warn('There were some problems with deploying')
    errors.forEach((e) => {
      logger.error(e)
    })
  } else if (skipped.size === activeProviders.length)
    logger.success('All providers already pin this CID')
  else logger.success('Deployed across all providers')

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
