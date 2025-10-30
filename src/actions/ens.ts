import { styleText } from 'node:util'
import { encodeData } from 'ox/AbiFunction'
import { type Address, fromPublicKey } from 'ox/Address'
import { type Hex, toBigInt } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import { toHex } from 'ox/Signature'
import { chains, isTTY } from '../constants.js'
import { MissingCLIArgsError, MissingKeyError } from '../errors.js'
import type { ChainName } from '../types.js'
import {
  chainToRpcUrl,
  PUBLIC_RESOLVER_ADDRESS,
  prepareUpdateEnsArgs,
  setContentHash,
} from '../utils/ens.js'
import { assertCID } from '../utils/ipfs.js'
import { logger } from '../utils/logger.js'
import { getNonce } from '../utils/safe/constants.js'
import {
  type EIP3770Address,
  getEip3770Address,
} from '../utils/safe/eip3770.js'
import { proposeTransaction } from '../utils/safe/propose.js'
import { OperationType, type SafeTransactionData } from '../utils/safe/types.js'
import {
  generateSafeTransactionSignature,
  prepareSafeTransactionData,
} from '../utils/safe.js'
import {
  sendTransaction,
  simulateTransaction,
  waitForTransaction,
} from '../utils/tx.js'
import { execTransactonWithRole } from '../utils/zodiac-roles/exec.js'

export type EnsActionArgs = Partial<{
  chain: ChainName
  safe: Address | EIP3770Address
  rpcUrl: string
  'resolver-address': Address
  verbose: boolean
  'dry-run': boolean
  'roles-mod-address': Address
}>

export const ensAction = async ({
  cid,
  domain,
  options = {},
}: {
  cid: string
  domain: string
  options: EnsActionArgs
}) => {
  const {
    chain: chainName = 'mainnet',
    safe: safeAddress,
    rpcUrl,
    'resolver-address': resolverAddress,
    'roles-mod-address': rolesModAddress,
  } = options

  assertCID(cid)
  if (!domain) throw new MissingCLIArgsError([domain])
  const chain = chains[chainName]

  const transport = fromHttp(rpcUrl ?? chainToRpcUrl(chainName))

  const provider = Provider.from(transport)

  const pk = process.env.BLUMEN_PK as Hex

  if (!pk) throw new MissingKeyError('PK')

  let contentHash = '',
    node: Hex = '0x'
  try {
    const result = prepareUpdateEnsArgs({
      cid,
      domain,
      codec: cid.length === 64 ? 'swarm' : 'ipfs',
    })
    contentHash = result.contentHash
    node = result.node
  } catch (e) {
    if ((e as Error).message.includes('disallowed character'))
      logger.error(`Invalid ENS domain: ${domain}`, e)
    else if ((e as Error).message.includes('Incorrect length')) {
      logger.error(`Invalid IPFS CID: ${cid}`, e)
    } else {
      logger.error(e)
    }
    return
  }

  const address = fromPublicKey(getPublicKey({ privateKey: pk }))

  logger.info(`Validating transaction for wallet ${address}`)

  const from = safeAddress
    ? getEip3770Address({ fullAddress: safeAddress, chainId: chain.id }).address
    : address

  const data = encodeData(setContentHash, [node, `0x${contentHash}`])

  if (options.verbose) console.log('Transaction encoded data:', data)

  const to = resolverAddress || PUBLIC_RESOLVER_ADDRESS[chainName]

  if (to === PUBLIC_RESOLVER_ADDRESS[chainName] && !domain.endsWith('.eth'))
    throw new Error('Domain must end with .eth')

  if (safeAddress) {
    logger.info(
      `Preparing a transaction for Safe ${safeAddress} on ${chainName}`,
    )

    const { address: safe } = getEip3770Address({
      fullAddress: safeAddress,
      chainId: chain.id,
    })

    const nonce = toBigInt(
      await provider.request({
        method: 'eth_call',
        params: [
          {
            to: safe,
            data: encodeData(getNonce),
          },
          'latest',
        ],
      }),
    )

    if (options.verbose) logger.info(`Nonce: ${nonce}`)

    const txData: SafeTransactionData = {
      nonce,
      operation: OperationType.Call,
      to,
      data,
      value: 0n,
    }

    if (rolesModAddress) {
      logger.info(`Using Zodiac Roles module`)

      await execTransactonWithRole({
        provider,
        data,
        resolverAddress: to,
        rolesModAddress,
        from: address,
        privateKey: pk,
        chainId: chain.id,
        explorerUrl: chain.blockExplorers.default.url,
      })
    } else {
      const { safeTxHash } = await prepareSafeTransactionData({
        txData,
        safeAddress,
        chainId: chain.id,
        provider,
      })

      logger.info(`Signing a Safe transaction with a hash ${safeTxHash}`)

      const senderSignature = await generateSafeTransactionSignature({
        safeAddress,
        txData,
        chainId: chain.id,
        privateKey: pk,
      })

      if (!options['dry-run']) {
        logger.info('Proposing a Safe transaction')

        try {
          await proposeTransaction({
            txData,
            safeAddress,
            safeTxHash,
            senderSignature: toHex(senderSignature),
            chainId: chain.id,
            chainName: chainName,
            address,
          })
          const safeLink = `https://app.safe.global/transactions/queue?safe=${safeAddress}`
          logger.success(
            `Transaction proposed to a Safe wallet.\nOpen in a browser: ${
              isTTY ? styleText('underline', safeLink) : safeLink
            }`,
          )
        } catch (e) {
          logger.error('Failed to propose a transaction', e)
          return
        }
      }
    }
  } else {
    await simulateTransaction({
      provider,
      to,
      data,
      abi: setContentHash,
      from,
    })

    const hash = await sendTransaction({
      privateKey: pk,
      provider,
      chainId: chain.id,
      to,
      data,
      from,
    })

    logger.info(
      `Transaction pending: ${chain.blockExplorers.default.url}/tx/${hash}`,
    )

    try {
      await waitForTransaction(provider, hash)
    } catch (e) {
      return logger.error(e)
    }

    logger.success('Transaction succeeded')
    const browserLink = `https://${domain}.limo`
    logger.info(
      `Open in a browser: ${isTTY ? styleText('underline', browserLink) : browserLink}`,
    )
  }
}
