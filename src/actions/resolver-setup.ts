import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { type Address, checksum, fromPublicKey } from 'ox/Address'
import { toBigInt } from 'ox/Bytes'
import type { Hex } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import { chains, isTTY } from '../constants.js'
import { styleText } from '../deps.js'
import { MissingCLIArgsError, MissingKeyError } from '../errors.js'
import type { ChainName } from '../types.js'
import { getExactAddress } from '../utils/address/getExactAddress.js'
import { getEnsResolver } from '../utils/ens/get-resolver.js'
import {
  computeResolverAddress,
  deployProxyData,
  ensv2Addresses,
  grantRootRolesData,
  hasCode,
  hasRootRoles,
  isPermissionedResolver,
  prepareSetResolverTx,
  ROLE_SET_CONTENTHASH,
  ROLE_SET_CONTENTHASH_ADMIN,
} from '../utils/ens/permissioned-resolver.js'
import { chainToRpcUrl, type EnsName } from '../utils/ens.js'
import { logger } from '../utils/logger.js'
import {
  type EIP3770Address,
  getEip3770Address,
  getEip3770NetworkPrefixFromChainId,
} from '../utils/safe/eip3770.js'
import {
  sendTransaction,
  simulateTransaction,
  waitForTransaction,
} from '../utils/tx.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export type ResolverSetupActionArgs = Partial<{
  chain: ChainName
  safe: Address | EIP3770Address | EnsName
  'rpc-url': string
  verbose: boolean
  'dry-run': boolean
  resolver: Address
  salt: string
  'role-address': Address
}>

type SetupTransaction = {
  to: Address
  data: Hex
  description: string
}

export const resolverSetupAction = async ({
  domain,
  options = {},
}: {
  domain: string
  options?: ResolverSetupActionArgs
}) => {
  if (!domain) throw new MissingCLIArgsError(['domain'])
  if (!domain.endsWith('.eth')) throw new Error('Domain must end with .eth')

  const {
    chain: chainName = 'mainnet',
    safe: safeOption,
    'rpc-url': rpcUrl,
    'role-address': roleOption,
    resolver: resolverOption,
    salt: saltOption,
    'dry-run': dryRun,
    verbose,
  } = options

  const chain = chains[chainName]
  const provider = Provider.from(fromHttp(rpcUrl ?? chainToRpcUrl(chainName)))

  const pk = process.env.OMNIPIN_PK as Hex | undefined
  const safe = safeOption
    ? await getExactAddress({ chain, addressOrEns: safeOption, provider })
    : undefined

  if (!safe && !pk) throw new MissingKeyError('PK')

  const signer = pk
    ? checksum(fromPublicKey(getPublicKey({ privateKey: pk })))
    : undefined

  const admin = safe ?? signer
  if (!admin) throw new MissingKeyError('PK')

  // In `--safe` mode the Safe is the resolver admin and already holds the role,
  // so the proposer/delegate needs none. `--role-address` grants the role to
  // another account, e.g. a CI key or a separate Safe that does not own the
  // name.
  const roleAddress = roleOption ? checksum(roleOption) : (safe ?? signer)
  if (!roleAddress) throw new MissingKeyError('PK')

  // The portal picks a fresh random salt per deployment. The factory binds it
  // to the deployer (`keccak256(abi.encode(msg.sender, salt))`), so the
  // resolver address is not recoverable from the owner alone — the command
  // prints the predicted address before deploying it.
  const salt = saltOption ? BigInt(saltOption) : toBigInt(randomBytes(32))

  if (verbose) {
    logger.info(`Chain: ${chainName} (id ${chain.id})`)
    logger.info(`Admin: ${admin}`)
    logger.info(`Role address: ${roleAddress}`)
    logger.info(`Salt: ${salt}`)
  }

  const currentResolver = await getEnsResolver({ provider, name: domain })
  const hasCurrentResolver =
    currentResolver.toLowerCase() !== ZERO_ADDRESS.toLowerCase()

  const transactions: SetupTransaction[] = []
  let targetResolver: Address
  let deploying = false

  if (resolverOption) {
    targetResolver = checksum(resolverOption)
    if (!(await isPermissionedResolver({ provider, address: targetResolver })))
      throw new Error(
        `${targetResolver} is not an ENSv2 permissioned resolver. Omit --resolver to deploy one.`,
      )
  } else if (
    hasCurrentResolver &&
    (await isPermissionedResolver({ provider, address: currentResolver }))
  ) {
    targetResolver = currentResolver
    logger.info(`Using the existing permissioned resolver ${targetResolver}`)
  } else {
    targetResolver = await computeResolverAddress({
      provider,
      chainName,
      deployer: admin,
      salt,
    })

    const deployed = await hasCode({ provider, address: targetResolver })
    if (deployed) {
      logger.info(`Resolver already deployed at ${targetResolver}`)
    } else {
      deploying = true

      if (hasCurrentResolver)
        logger.warn(
          `${domain} currently resolves through ${currentResolver}. Its records will stop resolving until they are re-created in the new resolver.`,
        )

      transactions.push({
        to: ensv2Addresses[chainName].factory,
        data: deployProxyData({ chainName, salt, admin, roleAddress }),
        description: `Deploy the ENSv2 permissioned resolver at ${targetResolver}`,
      })
      logger.info(`Resolver will be deployed at ${targetResolver}`)
    }
  }

  // A fresh deployment grants the role inside `initialize`, so the resolver
  // cannot be queried until the deploy transaction has executed.
  const roleGranted =
    deploying ||
    (await hasRootRoles({
      provider,
      resolver: targetResolver,
      roleBitmap: ROLE_SET_CONTENTHASH,
      account: roleAddress,
    }))

  if (!roleGranted) {
    if (!deploying) {
      const isAdmin = await hasRootRoles({
        provider,
        resolver: targetResolver,
        roleBitmap: ROLE_SET_CONTENTHASH_ADMIN,
        account: admin,
      })

      if (!isAdmin)
        throw new Error(
          `${admin} does not have ROLE_SET_CONTENTHASH_ADMIN on ${targetResolver} and cannot grant the role.`,
        )
    }

    transactions.push({
      to: targetResolver,
      data: grantRootRolesData(roleAddress),
      description: `Grant ROLE_SET_CONTENTHASH to ${roleAddress}`,
    })
  }

  if (
    !hasCurrentResolver ||
    currentResolver.toLowerCase() !== targetResolver.toLowerCase()
  ) {
    const { to, data } = await prepareSetResolverTx({
      provider,
      chainName,
      name: domain,
      resolver: targetResolver,
    })
    transactions.push({
      to,
      data,
      description: `Point ${domain} to the resolver ${targetResolver}`,
    })
  }

  if (transactions.length === 0) {
    logger.success(
      `${domain} already uses the permissioned resolver ${targetResolver}, and ${roleAddress} already has ROLE_SET_CONTENTHASH.`,
    )
    return
  }

  for (const transaction of transactions) {
    if (verbose) logger.info(transaction.description)
    try {
      await simulateTransaction({
        provider,
        to: transaction.to,
        data: transaction.data,
        from: admin,
      })
    } catch (e) {
      throw new Error(
        `Setup transaction failed to simulate: ${transaction.description}`,
        {
          cause: e,
        },
      )
    }
  }

  if (dryRun) {
    logger.success(
      `Simulated ${transactions.length} setup transaction(s) successfully. Nothing was sent.`,
    )
    return
  }

  if (safe) {
    const { address: safeAddress, prefix } = getEip3770Address({
      fullAddress: safe,
      chainId: chain.id,
    })
    const safePrefix = prefix || getEip3770NetworkPrefixFromChainId(chain.id)

    await writeFile(
      'resolver-setup.json',
      JSON.stringify(
        {
          version: '1.0',
          chainId: chain.id.toString(),
          meta: {
            name: 'Setup ENSv2 permissioned resolver',
            txBuilderVersion: '1.18.2',
            createdFromSafeAddress: safeAddress,
          },
          transactions: transactions.map(({ to, data }) => ({
            to,
            value: '0',
            data,
            contractMethod: null,
            contractInputsValues: null,
          })),
        },
        null,
        2,
      ),
    )

    logger.success('Created resolver-setup.json in the current directory')

    logger.text(
      `Open in a browser: ${styleText(
        'underline',
        `https://app.safe.global/apps/open?safe=${safePrefix}:${safeAddress}&appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder`,
      )}`,
    )
    logger.text(`Upload ${styleText('bold', 'resolver-setup.json')} in the UI`)

    if (!isTTY) logger.text(`Resolver: ${targetResolver}`)
    return
  }

  if (!pk) throw new MissingKeyError('PK')

  for (const transaction of transactions) {
    logger.info(transaction.description)
    const hash = await sendTransaction({
      privateKey: pk,
      provider,
      chainId: chain.id,
      to: transaction.to,
      data: transaction.data,
      from: admin,
    })
    logger.info(
      `Transaction pending: ${chain.blockExplorers.default.url}/tx/${hash}`,
    )
    await waitForTransaction(provider, hash)
  }

  logger.success(
    `Resolver ${targetResolver} is ready. ${roleAddress} can now update the content hash of ${domain}.`,
  )
}
