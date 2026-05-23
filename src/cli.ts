#!/usr/bin/env node

import type { Address } from 'ox/Address'
import { CLI } from 'spektr'
import { colorPlugin } from 'spektr/plugins/color.js'
import { type BridgeActionArgs, bridgeAction } from './actions/bridge.js'
import { type DeployActionArgs, deployAction } from './actions/deploy.js'
import { type DepositActionArgs, depositAction } from './actions/deposit.js'
import { dnsLinkAction } from './actions/dnslink.js'
import { type EnsActionArgs, ensAction } from './actions/ens.js'
import { packAction } from './actions/pack.js'
import { pinAction } from './actions/pin.js'
import { statusAction } from './actions/status.js'
import { zodiacAction } from './actions/zodiac.js'
import { isTTY } from './constants.js'
import { AllProvidersFailedError } from './errors.js'
import { logger } from './utils/logger.js'

const cli = new CLI({ name: 'omnipin', plugins: isTTY ? [colorPlugin] : [] })

const onchainOptions = [
  {
    name: 'chain',
    description: 'Chain to use for ENS',
    type: 'string',
  },
  {
    name: 'safe',
    description: 'Deploy using a Safe multi-sig',
    type: 'string',
  },
  {
    name: 'rpc-url',
    description: 'Custom Ethereum RPC',
    type: 'string',
  },
  {
    name: 'verbose',
    description: 'More verbose logs',
    type: 'boolean',
    short: 'v',
  },
] as const

const ensOptions = [
  ...onchainOptions,
  {
    name: 'dry-run',
    description: 'Do not send a transaction',
    type: 'boolean',
  },
  {
    name: 'roles-mod-address',
    description: 'Zodiac Roles Module address',
    type: 'string',
  },
] as const

cli.command(
  'deploy',
  ([dir], options) =>
    deployAction({
      dir: dir as string,
      options: options as DeployActionArgs,
    }),
  {
    description: 'Start the deployment process',
    options: [
      {
        name: 'strict',
        description: 'Throw if one of the providers fails',
        type: 'boolean',
      },
      {
        name: 'ens',
        description: 'Update Content-Hash of an ENS domain',
        type: 'string',
      },
      {
        name: 'name',
        short: 'n',
        description: 'Name of the distribution (without file extension)',
        type: 'string',
      },
      {
        name: 'dist',
        short: 'd',
        description: 'Directory to store the distribution file',
        type: 'string',
      },
      {
        name: 'providers',
        description: 'Explicit provider order',
        type: 'string',
      },
      {
        name: 'dnslink',
        description: 'Update DNSLink',
        type: 'string',
      },
      {
        name: 'progress-bar',
        description: 'Render a progress bar during content upload',
        type: 'boolean',
      },
      {
        name: 'filecoin-chain',
        description: 'Filecoin network',
        type: 'string',
      },
      {
        name: 'filecoin-force-new-dataset',
        description: 'Create a new dataset instead of using an existing one',
        type: 'boolean',
      },
      ...ensOptions,
    ] as const,
  },
)

cli.command<[string]>(
  'status',
  ([cid], options) => statusAction({ cid, options }),
  {
    description: 'Check IPFS deployment status',
    options: [
      {
        name: 'providers',
        description: 'List providers to check status from',
        type: 'string',
      },
      {
        name: 'verbose',
        description: 'More verbose logs',
        type: 'boolean',
        short: 'v',
      },
    ] as const,
  },
)

cli.command<[string, string]>(
  'ens',
  ([cid, domain], options) =>
    ensAction({
      cid,
      domain,
      options: options as EnsActionArgs,
    }),
  {
    description: 'Update ENS domain Content-Hash with an IFPS CID',
    options: ensOptions,
  },
)

cli.command<[string, string]>(
  'dnslink',
  ([cid, name], options) => dnsLinkAction({ cid, name, options }),
  {
    options: [
      {
        name: 'verbose',
        description: 'More verbose logs',
        type: 'boolean',
        short: 'v',
      },
    ] as const,
    description: 'Update DNSLink with a given CID using Cloudflare.',
  },
)

cli.command<[string]>(
  'pack',
  ([dir], options) => packAction({ dir, options }),
  {
    options: [
      {
        name: 'name',
        short: 'n',
        description: 'Name of the distribution (without file extension)',
        type: 'string',
      },
      {
        name: 'dist',
        short: 'd',
        description: 'Directory to store the distribution file',
        type: 'string',
      },
      {
        name: 'only-hash',
        description: 'Only output CIDv1 to stdout',
        type: 'boolean',
        short: 'h',
      },
      {
        name: 'verbose',
        description: 'More verbose logs',
        type: 'boolean',
        short: 'v',
      },
      {
        name: 'tar',
        description: 'Pack as a TAR archive (for Swarm) instead of a CAR',
        type: 'boolean',
        short: 't',
      },
    ] as const,
    description:
      'Pack websites files into a CAR (or TAR with --tar) without uploading it anywhere',
  },
)

cli.command<[string]>('pin', ([cid], options) => pinAction({ cid, options }), {
  options: [
    {
      name: 'strict',
      description: 'Throw if one of the providers fails',
      type: 'boolean',
    },
    {
      name: 'providers',
      description: 'Explicit provider order',
      type: 'string',
    },
    {
      name: 'verbose',
      description: 'More verbose logs',
      type: 'boolean',
      short: 'v',
    },
  ] as const,
  description: 'Pin an IPFS CID on multiple providers',
})

cli.command<[string]>(
  'bridge',
  ([amount], options) =>
    bridgeAction({
      amount: amount as string,
      options: options as BridgeActionArgs,
    }),
  {
    description:
      'Bridge native tokens to a provider chain. Stops once the funds land in the destination wallet.',
    options: [
      {
        name: 'provider',
        description: 'Provider to bridge to (AIOZ or Filecoin)',
        type: 'string',
      },
      {
        name: 'from-chain',
        description:
          'Source chain for the bridge. AIOZ: eth, bsc. Filecoin: eth, opt, bsc, polygon, base, arb, avax.',
        type: 'string',
      },
      {
        name: 'from-token',
        description:
          'Source token symbol (USDC, ETH, USDT, …) or 0x address. Required for Filecoin.',
        type: 'string',
      },
      {
        name: 'to',
        description:
          'Destination address on the provider chain. Defaults to the signer address.',
        type: 'string',
      },
      {
        name: 'rpc-url',
        description: 'Custom RPC for the source chain',
        type: 'string',
      },
      {
        name: 'aioz-rpc-url',
        description: 'Custom RPC for AIOZ mainnet (chain 168)',
        type: 'string',
      },
      {
        name: 'fil-ratio',
        description:
          'Fraction of the input split to FIL (rest to USDfc). Filecoin only. Default 0.1.',
        type: 'string',
      },
      {
        name: 'slippage',
        description:
          'Maximum acceptable slippage in percent for Squid swaps. Filecoin only. Default 1.',
        type: 'string',
      },
      {
        name: 'verbose',
        description: 'More verbose logs',
        type: 'boolean',
        short: 'v',
      },
    ] as const,
  },
)

cli.command<[string]>(
  'deposit',
  ([amount], options) =>
    depositAction({
      amount: amount as string,
      options: options as DepositActionArgs,
    }),
  {
    description:
      'Deposit already-held tokens into a provider payment contract (Filecoin: USDfc → Filecoin Pay).',
    options: [
      {
        name: 'provider',
        description: 'Provider to deposit for (Filecoin)',
        type: 'string',
      },
      {
        name: 'from',
        description:
          'Wallet address holding the tokens. Defaults to the signer address.',
        type: 'string',
      },
      {
        name: 'verbose',
        description: 'More verbose logs',
        type: 'boolean',
        short: 'v',
      },
    ] as const,
  },
)

cli.command<[Address, Address]>(
  'zodiac',
  ([rolesModAddress, resolverAddress], options) =>
    zodiacAction({ rolesModAddress, resolverAddress, options }),
  {
    options: [...onchainOptions] as const,
  },
)

cli.help()

// Surface action errors as a non-zero exit code without dumping an
// "UnhandledPromiseRejection" traceback. AllProvidersFailedError has already
// logged each underlying error in the action itself; for anything else, log
// the message before exiting.
process.on('unhandledRejection', (err) => {
  if (!(err instanceof AllProvidersFailedError)) logger.error(err)
  process.exitCode = 1
})

try {
  cli.handle(process.argv.slice(2))
} catch (err) {
  if (!(err instanceof AllProvidersFailedError)) logger.error(err)
  process.exitCode = 1
}
