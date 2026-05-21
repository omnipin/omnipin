import { encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { fromPublicKey } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import { setTimeout } from '../deps.js'
import { logger } from './logger.js'
import { sendTransaction, waitForTransaction } from './tx.js'

export const AIOZ_BRIDGE_API = 'https://api-bridge.aioz.network'

export type SourceChain = 'eth' | 'bsc'

export type ChainConfig = {
  id: number
  name: string
  rpc: string
  explorer: string
  /** AIOZ token address on this chain. `null` means the chain's native token IS AIOZ. */
  aiozToken: Address | null
}

export const AIOZ_MAINNET: ChainConfig = {
  id: 168,
  name: 'AIOZ Network',
  rpc: 'https://eth-dataseed.aioz.network',
  explorer: 'https://explorer.aioz.network',
  aiozToken: null,
}

export const SOURCE_CHAINS: Record<SourceChain, ChainConfig> = {
  eth: {
    id: 1,
    name: 'Ethereum',
    rpc: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
    aiozToken: '0x626E8036dEB333b408Be468F951bdB42433cBF18',
  },
  bsc: {
    id: 56,
    name: 'BNB Smart Chain',
    rpc: 'https://bsc-dataseed.binance.org',
    explorer: 'https://bscscan.com',
    aiozToken: '0x33d08D8C7a168333a85285a68C0042b39fC3741D',
  },
}

const erc20Transfer = {
  name: 'transfer',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ type: 'bool' }],
} as const

type SwapDirection = {
  from_network: string
  to_network: string
  asset: string
  pool_address: string
  swap_type: string
}

type SwapStatusResponse = {
  status: 'sending' | 'sent' | 'fail' | string
  tx_out?: string
}

/**
 * Fetch the live pool address for a given bridge direction.
 * Pool addresses are EOAs and can rotate — never hardcode.
 */
export const fetchPoolAddress = async ({
  from,
  to,
  asset = 'AIOZ',
}: {
  from: string
  to: string
  asset?: string
}): Promise<Address> => {
  const res = await fetch(`${AIOZ_BRIDGE_API}/swap-directions`)
  if (!res.ok) {
    throw new Error(
      `AIOZ bridge /swap-directions returned ${res.status} ${res.statusText}`,
    )
  }

  const directions = (await res.json()) as SwapDirection[]

  const match = directions.find(
    (d) =>
      d.from_network?.toLowerCase() === from.toLowerCase() &&
      d.to_network?.toLowerCase() === to.toLowerCase() &&
      d.asset?.toUpperCase() === asset.toUpperCase(),
  )

  if (!match) {
    throw new Error(
      `No AIOZ bridge direction found for ${from} → ${to} (asset ${asset})`,
    )
  }

  return match.pool_address as Address
}

/**
 * Poll the AIOZ bridge relayer until the source tx is credited on the
 * destination chain. Tolerates 404 / 502 during the warm-up window
 * (Cloudflare cold cache + relayer indexing lag).
 *
 * Resolves with the relayer's `tx_out` when status becomes `sent`.
 * Throws if status becomes `fail` or the timeout is exceeded.
 */
export const pollSwapStatus = async ({
  srcTxHash,
  maxAttempts = 60,
  intervalMs = 10_000,
  warmupAttempts = 6,
  onAttempt,
  fetchFn = fetch,
}: {
  srcTxHash: Hex
  maxAttempts?: number
  intervalMs?: number
  warmupAttempts?: number
  onAttempt?: (attempt: number, status: string | null) => void
  fetchFn?: typeof fetch
}): Promise<{ status: 'sent'; txOut: string | undefined }> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let status: string | null = null
    let txOut: string | undefined

    try {
      const res = await fetchFn(`${AIOZ_BRIDGE_API}/swap/${srcTxHash}`)

      if (res.ok) {
        const json = (await res.json()) as SwapStatusResponse
        status = json.status ?? null
        txOut = json.tx_out
      } else if (res.status === 404 || res.status === 502) {
        // Tolerate during warmup; the relayer may not have indexed yet
        // and Cloudflare may be returning a cold-cache 502.
        if (attempt > warmupAttempts && res.status !== 502) {
          throw new Error(
            `AIOZ bridge /swap returned ${res.status} after warmup`,
          )
        }
      } else {
        throw new Error(
          `AIOZ bridge /swap returned ${res.status} ${res.statusText}`,
        )
      }
    } catch (e) {
      // Network blip — log on verbose, keep polling
      if (attempt > warmupAttempts) throw e
    }

    onAttempt?.(attempt, status)

    if (status === 'sent') return { status: 'sent', txOut }
    if (status === 'fail') {
      throw new Error('AIOZ bridge relayer reported failure (status=fail)')
    }

    if (attempt < maxAttempts) await setTimeout(intervalMs)
  }

  throw new Error(
    `AIOZ bridge poll timed out after ${maxAttempts} attempts for tx ${srcTxHash}`,
  )
}

/**
 * Full top-up flow: bridge AIOZ from ETH/BSC to AIOZ mainnet, then optionally
 * forward the native AIOZ to a destination address.
 */
export const topupAioz = async ({
  privateKey,
  fromChain,
  amountWei,
  to,
  verbose,
  sourceRpcUrl,
  aiozRpcUrl,
}: {
  privateKey: Hex
  fromChain: SourceChain
  amountWei: bigint
  /** Destination address on AIOZ mainnet. Defaults to the signer's address. */
  to?: Address
  verbose?: boolean
  sourceRpcUrl?: string
  aiozRpcUrl?: string
}): Promise<{
  srcTxHash: Hex
  bridgeTxOut: string | undefined
  forwardTxHash?: Hex
}> => {
  const signer = fromPublicKey(getPublicKey({ privateKey }))
  const destination = (to ?? signer) as Address

  const sourceChain = SOURCE_CHAINS[fromChain]
  if (!sourceChain) {
    throw new Error(`Unsupported source chain: ${fromChain}`)
  }
  if (!sourceChain.aiozToken) {
    throw new Error(`Chain ${fromChain} has no AIOZ token mapping`)
  }

  logger.info(
    `Bridging ${amountWei} (wei) AIOZ from ${sourceChain.name} → ${AIOZ_MAINNET.name}`,
  )

  // 1. Resolve pool address LIVE.
  const pool = await fetchPoolAddress({
    from: fromChain,
    to: 'aioz',
  })

  if (verbose) logger.info(`Bridge pool: ${pool}`)

  // 2. Send the ERC-20/BEP-20 transfer on the source chain.
  const sourceTransport = fromHttp(sourceRpcUrl ?? sourceChain.rpc)
  const sourceProvider = Provider.from(sourceTransport)

  const transferData = encodeData(erc20Transfer, [pool, amountWei])

  const srcTxHash = (await sendTransaction({
    provider: sourceProvider,
    chainId: sourceChain.id,
    privateKey,
    to: sourceChain.aiozToken,
    data: transferData,
    from: signer,
  })) as Hex

  logger.info(`Source tx submitted: ${sourceChain.explorer}/tx/${srcTxHash}`)

  await waitForTransaction(sourceProvider, srcTxHash)
  logger.success('Source tx confirmed')

  // 3. Poll the relayer.
  logger.info('Waiting for AIOZ bridge relayer to credit destination chain…')
  const { txOut: bridgeTxOut } = await pollSwapStatus({
    srcTxHash,
    onAttempt: (attempt, status) => {
      if (verbose) {
        logger.info(`  poll #${attempt}: status=${status ?? '<none>'}`)
      }
    },
  })

  logger.success(
    `Bridge complete. Destination tx: ${
      bridgeTxOut ? `${AIOZ_MAINNET.explorer}/tx/${bridgeTxOut}` : '<unknown>'
    }`,
  )

  // 4. Forward on AIOZ mainnet if --to differs from the signer.
  if (destination.toLowerCase() === signer.toLowerCase()) {
    logger.info('Destination equals signer; no forward step needed')
    return { srcTxHash, bridgeTxOut }
  }

  logger.info(
    `Forwarding ${amountWei} (wei) native AIOZ to ${destination} on ${AIOZ_MAINNET.name}`,
  )

  const aiozTransport = fromHttp(aiozRpcUrl ?? AIOZ_MAINNET.rpc)
  const aiozProvider = Provider.from(aiozTransport)

  const forwardTxHash = (await sendTransaction({
    provider: aiozProvider,
    chainId: AIOZ_MAINNET.id,
    privateKey,
    to: destination,
    data: '0x',
    from: signer,
    value: amountWei,
  })) as Hex

  logger.info(
    `Forward tx submitted: ${AIOZ_MAINNET.explorer}/tx/${forwardTxHash}`,
  )

  await waitForTransaction(aiozProvider, forwardTxHash)
  logger.success('Forward tx confirmed')

  return { srcTxHash, bridgeTxOut, forwardTxHash }
}
