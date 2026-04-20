#!/usr/bin/env node

import type { Address } from 'ox/Address'
import { CLI } from 'spektr'
import { colorPlugin } from 'spektr/plugins/color.js'
import { type DeployActionArgs, deployAction } from './actions/deploy.js'
import { dnsLinkAction } from './actions/dnslink.js'
import { type EnsActionArgs, ensAction } from './actions/ens.js'
import { packAction } from './actions/pack.js'
import { pinAction } from './actions/pin.js'
import { pingAction } from './actions/ping.js'
import { statusAction } from './actions/status.js'
import { zodiacAction } from './actions/zodiac.js'
import { isTTY } from './constants.js'
import { loadPlugin } from './plugin-loader.js'
import { pluginRegistry } from './plugin-runtime.js'

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
        name: 'plugins',
        description: 'Comma-separated list of plugins to load',
        type: 'string',
      },
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
    options: [
      {
        name: 'plugins',
        description: 'Comma-separated list of plugins to load',
        type: 'string',
      },
      ...ensOptions,
    ],
  },
)

cli.command<[string, string]>(
  'ping',
  ([cid, endpoint], options) =>
    pingAction({
      cid,
      endpoint,
      options: Object.fromEntries(
        Object.entries(options).map(([k, v]) => [
          k,
          Number.parseInt(v as string, 10),
        ]),
      ),
    }),
  {
    description: 'Ping an endpoint until it resolves content',
    options: [
      {
        name: 'max-retries',
        description: 'Max retries',
        type: 'string',
      },
      {
        name: 'retry-interval',
        description: 'Interval between retries (in ms)',
        type: 'string',
      },
      {
        name: 'timeout',
        description: 'Request timeout until next attempt (in ms)',
        type: 'string',
        short: 't',
      },
    ] as const,
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
    ] as const,
    description: 'Pack websites files into a CAR without uploading it anywhere',
  },
)

cli.command<[string]>('pin', ([cid], options) => pinAction({ cid, options }), {
  options: [
    {
      name: 'plugins',
      description: 'Comma-separated list of plugins to load',
      type: 'string',
    },
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

cli.command<[Address, Address]>(
  'zodiac',
  ([rolesModAddress, resolverAddress], options) =>
    zodiacAction({ rolesModAddress, resolverAddress, options }),
  {
    options: [...onchainOptions] as const,
  },
)

// Parse plugins from CLI args
const parsePlugins = async (pluginsArg?: string) => {
  if (pluginsArg) {
    const pluginSpecifiers = pluginsArg.split(',')
    for (const specifier of pluginSpecifiers) {
      try {
        const plugin = await loadPlugin(specifier.trim())
        await plugin.setup(pluginRegistry)
        console.log(`🔌 Loaded plugin: ${plugin.name}`)
      } catch (error) {
        console.error(`❌ Failed to load plugin ${specifier}:`, error)
        process.exit(1)
      }
    }
  }
}

// We need to manually parse the --plugins argument since Spektr doesn't support global options easily
const parsePluginsFromArgs = (args: string[]) => {
  const pluginsIndex = args.findIndex(
    (arg) => arg === '--plugins' || arg.startsWith('--plugins='),
  )
  if (pluginsIndex !== -1) {
    if (args[pluginsIndex].startsWith('--plugins=')) {
      return args[pluginsIndex].split('=')[1]
    } else if (
      pluginsIndex + 1 < args.length &&
      !args[pluginsIndex + 1].startsWith('-')
    ) {
      return args[pluginsIndex + 1]
    }
  }
  return undefined
}

// Main execution with plugin loading
const main = async () => {
  const pluginsArg = parsePluginsFromArgs(process.argv.slice(2))
  await parsePlugins(pluginsArg)
  cli.handle(process.argv.slice(2))
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
