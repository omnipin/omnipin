import { encodeData } from 'ox/AbiFunction'
import { type Address, fromPublicKey } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import * as Value from 'ox/Value'
import { fetchSourceBalance } from './filecoin-bridge.js'
import { logger } from './logger.js'
import { sendTransaction, waitForTransaction } from './tx.js'

/**
 * Fula (Functionland) deposit.
 *
 * Fula has no chain of its own — $FULA is a plain ERC-20 deployed on Ethereum
 * and Base — so "deposit" is simply an ERC-20 `transfer` of $FULA to Fula's
 * payment vault. The credited balance is then spent down by the pinning
 * service (3 FULA / GB / month). To acquire $FULA from another token first,
 * swap on a DEX, then run this command with the $FULA you hold.
 */

/** Chains where $FULA is deployed and the deposit vault is reachable. */
export type FulaChainKey = 'eth' | 'base'

type FulaChainConfig = {
  id: 1 | 8453
  name: string
  rpc: string
  explorer: string
  /** $FULA (Functionland Fula) ERC-20, 18 decimals. */
  token: Address
}

export const FULA_CHAINS: Record<FulaChainKey, FulaChainConfig> = {
  eth: {
    id: 1,
    name: 'Ethereum',
    rpc: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
    token: '0x92217cCaEDBdbc54C76c15feA18823db1558fDc9',
  },
  base: {
    id: 8453,
    name: 'Base',
    rpc: 'https://base-rpc.publicnode.com',
    explorer: 'https://basescan.org',
    token: '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB',
  },
}

export const isFulaChainKey = (v: string | undefined): v is FulaChainKey =>
  typeof v === 'string' && v in FULA_CHAINS

/**
 * Fula's deposit vault. $FULA sent here is credited to the sender's Fula
 * account. The same EOA is used across the supported chains; override with
 * `--to` if Fula rotates it.
 */
export const FULA_VAULT_ADDRESS: Address =
  '0x83dF763874934Cc72C309dA5566eA2AFB6eE4f4e'

/** $FULA has 18 decimals on every chain it is deployed to. */
const FULA_DECIMALS = 18

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

export type FulaDepositResult = {
  /** Source-chain tx hash of the $FULA transfer to the vault. */
  depositTxHash: Hex
  /** Amount deposited, in $FULA atomic units (18 decimals). */
  depositedAmount: bigint
  /** Chain the deposit was made on. */
  chain: FulaChainKey
  /** Vault the $FULA was sent to. */
  vault: Address
}

/** Order chains are probed/reported in, and the tiebreaker fallback (eth first). */
const FULA_CHAIN_ORDER: FulaChainKey[] = ['eth', 'base']

/**
 * Auto-detect which chain to deposit from when `--chain` is omitted.
 *
 * The vault is the same EOA on every chain, so there is no on-chain "home
 * chain" marker. Instead we pick the chain where the deposit can actually
 * succeed: the one where `owner` holds the most $FULA. Each probe is a single
 * `balanceOf` call, run in parallel, and tolerant of a chain's RPC being down.
 *
 * @returns The chain with the largest $FULA balance for `owner`, or
 *   `undefined` if `owner` holds no $FULA on any supported chain (the caller
 *   then falls back to the default).
 */
export const detectFulaChain = async ({
  owner,
  verbose,
}: {
  owner: Address
  verbose?: boolean
}): Promise<FulaChainKey | undefined> => {
  const balances = await Promise.all(
    FULA_CHAIN_ORDER.map(async (chain) => {
      const cfg = FULA_CHAINS[chain]
      try {
        const provider = Provider.from(fromHttp(cfg.rpc))
        const balance = await fetchSourceBalance({
          provider,
          token: cfg.token,
          owner,
        })
        return { chain, balance }
      } catch (e) {
        if (verbose)
          logger.warn(`Could not read FULA balance on ${cfg.name}: ${e}`)
        return { chain, balance: 0n }
      }
    }),
  )

  // Highest balance wins; FULA_CHAIN_ORDER (eth first) breaks ties.
  const best = balances.reduce((a, b) => (b.balance > a.balance ? b : a))
  if (best.balance <= 0n) return undefined

  if (verbose) {
    const summary = balances
      .map((b) => `${FULA_CHAINS[b.chain].name}=${Value.format(b.balance, 18)}`)
      .join(', ')
    logger.info(`Detected FULA balances: ${summary} → using ${best.chain}`)
  }
  return best.chain
}

/**
 * Transfer already-held $FULA to Fula's payment vault.
 *
 * @param amount Whole $FULA to deposit (e.g. `'10'` ⇒ 10 FULA). 18 decimals.
 * @param chain  Chain the $FULA is held on (`eth` or `base`).
 * @param to     Override the vault address (defaults to {@link FULA_VAULT_ADDRESS}).
 */
export const depositFula = async ({
  privateKey,
  amount,
  chain,
  to,
  rpcUrl,
  verbose,
}: {
  privateKey: Hex
  amount: string
  chain: FulaChainKey
  to?: Address
  rpcUrl?: string
  verbose?: boolean
}): Promise<FulaDepositResult> => {
  const chainConfig = FULA_CHAINS[chain]
  const vault = (to ?? FULA_VAULT_ADDRESS) as Address

  const signer = fromPublicKey(getPublicKey({ privateKey }))

  let amountAtomic: bigint
  try {
    amountAtomic = Value.from(amount, FULA_DECIMALS)
  } catch {
    throw new Error(`Invalid amount: ${amount}`)
  }
  if (amountAtomic <= 0n) throw new Error(`Amount must be positive: ${amount}`)

  const transport = fromHttp(rpcUrl ?? chainConfig.rpc)
  const provider = Provider.from(transport)

  logger.start(
    `Deposit ${Value.format(amountAtomic, FULA_DECIMALS)} FULA to Fula vault on ${chainConfig.name}`,
  )

  // Fail fast on insufficient balance instead of letting transfer() revert
  // after gas is already spent.
  const balance = await fetchSourceBalance({
    provider,
    token: chainConfig.token,
    owner: signer,
  })
  if (balance < amountAtomic) {
    throw new Error(
      `Insufficient FULA on ${chainConfig.name} for ${signer}: have ${Value.format(
        balance,
        FULA_DECIMALS,
      )}, need ${Value.format(amountAtomic, FULA_DECIMALS)}`,
    )
  }

  if (verbose) logger.info(`Sending FULA to vault ${vault}`)

  const depositTxHash = (await sendTransaction({
    provider,
    chainId: chainConfig.id,
    privateKey,
    to: chainConfig.token,
    data: encodeData(erc20Transfer, [vault, amountAtomic]),
    from: signer,
  })) as Hex

  logger.info(`Deposit tx: ${chainConfig.explorer}/tx/${depositTxHash}`)
  await waitForTransaction(provider, depositTxHash)
  logger.success('Deposit confirmed')

  return {
    depositTxHash,
    depositedAmount: amountAtomic,
    chain,
    vault,
  }
}
