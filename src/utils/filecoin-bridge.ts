import {
  DEFAULT_MINIMUM_NEW_DATASET_LOCKUP,
  filecoinMainnet,
  filProvider,
  LOCKUP_PERIOD,
  USDFC_SYBIL_FEE,
} from '@omnipin/foc/utils'
import { getServicePricing } from '@omnipin/foc/warm-storage'
import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type Address, fromPublicKey } from 'ox/Address'
import { fromNumber, type Hex, toBigInt } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import * as Value from 'ox/Value'
import { setTimeout } from '../deps.js'
import { logger } from './logger.js'
import {
  getRouteWithRetry,
  NATIVE_TOKEN,
  pollSquidStatus,
  type SquidRoute,
  type SquidRouteParams,
} from './squid.js'
import {
  estimateGas,
  getBalance,
  sendTransaction,
  waitForTransaction,
} from './tx.js'

/** Filecoin EVM mainnet (chain 314) constants. */
export const FILECOIN_MAINNET = {
  id: 314,
  name: 'Filecoin',
  rpc: 'https://api.node.glif.io/rpc/v1',
  explorer: 'https://filfox.info/en',
} as const

/** USDfc on Filecoin (the canonical USD-pegged storage payment token). */
export const FILECOIN_USDFC: Address =
  '0x80b98d3aa09ffff255c3ba4a241111ff1262f045'

/** axlUSDC on Filecoin (where Axelar bridges land USDC). */
export const FILECOIN_AXL_USDC: Address =
  '0xeb466342c4d449bc9f53a865d5cb90586f405215'

/** WFIL on Filecoin. */
export const FILECOIN_WFIL: Address =
  '0x60e1773636cf5e4a227d9ac24f20feca034ee25a'

/**
 * Canonical Uniswap Permit2 contract. Deterministically deployed at the same
 * address on every EVM chain we bridge from (Ethereum, Optimism, BSC, Polygon,
 * Base, Arbitrum, Avalanche).
 *
 * Squid's router pulls ERC-20 inputs through Permit2's `AllowanceTransfer`
 * module rather than a plain `transferFrom`, so spending requires both an
 * ERC-20 approval to Permit2 *and* a Permit2 allowance for the router. See
 * {@link ensureRouterAllowances}.
 */
export const PERMIT2_ADDRESS: Address =
  '0x000000000022D473030F116dDEE9F6B43aC78BA3'

/** Permit2 `AllowanceTransfer` infinite-amount sentinel (no per-pull decrement). */
const MAX_UINT160 = 2n ** 160n - 1n
/**
 * Max Permit2 expiration (uint48); a far-future timestamp so it never expires.
 * A plain `number` because uint48 fits in a JS safe integer, which is how the
 * ABI codec represents it.
 */
const MAX_UINT48 = 2 ** 48 - 1
/** Standard "infinite" ERC-20 allowance. */
const MAX_UINT256 = 2n ** 256n - 1n

export type SourceChainId = 1 | 10 | 56 | 137 | 8453 | 42161 | 43114

export type SourceChainKey =
  | 'eth'
  | 'opt'
  | 'bsc'
  | 'polygon'
  | 'base'
  | 'arb'
  | 'avax'

type ChainConfig = {
  id: SourceChainId
  name: string
  rpc: string
  explorer: string
  /** Symbol → ERC-20 address (or NATIVE_TOKEN sentinel). */
  tokens: Record<string, Address>
}

export const SOURCE_CHAINS: Record<SourceChainKey, ChainConfig> = {
  eth: {
    id: 1,
    name: 'Ethereum',
    rpc: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
    tokens: {
      ETH: NATIVE_TOKEN,
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    },
  },
  opt: {
    id: 10,
    name: 'Optimism',
    rpc: 'https://optimism-rpc.publicnode.com',
    explorer: 'https://optimistic.etherscan.io',
    tokens: {
      ETH: NATIVE_TOKEN,
      WETH: '0x4200000000000000000000000000000000000006',
      USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    },
  },
  bsc: {
    id: 56,
    name: 'BNB Smart Chain',
    rpc: 'https://bsc-rpc.publicnode.com',
    explorer: 'https://bscscan.com',
    tokens: {
      BNB: NATIVE_TOKEN,
      WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      USDT: '0x55d398326f99059fF775485246999027B3197955',
    },
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    rpc: 'https://polygon-bor-rpc.publicnode.com',
    explorer: 'https://polygonscan.com',
    tokens: {
      POL: NATIVE_TOKEN,
      MATIC: NATIVE_TOKEN,
      WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      USDC: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      'USDC.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
  },
  base: {
    id: 8453,
    name: 'Base',
    rpc: 'https://base-rpc.publicnode.com',
    explorer: 'https://basescan.org',
    tokens: {
      ETH: NATIVE_TOKEN,
      WETH: '0x4200000000000000000000000000000000000006',
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  },
  arb: {
    id: 42161,
    name: 'Arbitrum',
    rpc: 'https://arbitrum-one-rpc.publicnode.com',
    explorer: 'https://arbiscan.io',
    tokens: {
      ETH: NATIVE_TOKEN,
      WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      'USDC.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
  },
  avax: {
    id: 43114,
    name: 'Avalanche',
    rpc: 'https://avalanche-c-chain-rpc.publicnode.com',
    explorer: 'https://snowtrace.io',
    tokens: {
      AVAX: NATIVE_TOKEN,
      WAVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    },
  },
}

export const isSourceChainKey = (v: string | undefined): v is SourceChainKey =>
  typeof v === 'string' && v in SOURCE_CHAINS

const erc20Approve = {
  name: 'approve',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ type: 'bool' }],
} as const

const erc20Allowance = {
  name: 'allowance',
  type: 'function',
  stateMutability: 'view',
  inputs: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
  ],
  outputs: [{ type: 'uint256' }],
} as const

const erc20Decimals = {
  name: 'decimals',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'uint8' }],
} as const

const erc20BalanceOf = {
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ type: 'uint256' }],
} as const

/** Permit2 `AllowanceTransfer.approve(token, spender, amount, expiration)`. */
const permit2Approve = {
  name: 'approve',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'token', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
  ],
  outputs: [],
} as const

/** Permit2 `AllowanceTransfer.allowance(owner, token, spender)`. */
const permit2Allowance = {
  name: 'allowance',
  type: 'function',
  stateMutability: 'view',
  inputs: [
    { name: 'owner', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'spender', type: 'address' },
  ],
  outputs: [
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
} as const

/**
 * Resolve `--from-token` (either a known symbol on the given chain, or a raw
 * 0x address) to an ERC-20 contract address. Throws when the symbol is
 * unknown for the chain.
 */
export const resolveSourceToken = ({
  chain,
  token,
}: {
  chain: SourceChainKey
  token: string
}): Address => {
  if (token.startsWith('0x') && token.length === 42) {
    return token as Address
  }
  const upper = token.toUpperCase()
  const chainConfig = SOURCE_CHAINS[chain]
  // Allow case-insensitive symbol lookup including dotted symbols like USDC.e.
  for (const [sym, addr] of Object.entries(chainConfig.tokens)) {
    if (sym.toUpperCase() === upper) return addr
  }
  throw new Error(
    `Unknown token "${token}" on ${chainConfig.name}. Known symbols: ${Object.keys(
      chainConfig.tokens,
    ).join(', ')}. Or pass a raw 0x address.`,
  )
}

/** Read on-chain decimals for an ERC-20, or return 18 for the native sentinel. */
const fetchTokenDecimals = async ({
  provider,
  token,
}: {
  provider: Provider.Provider
  token: Address
}): Promise<number> => {
  if (token.toLowerCase() === NATIVE_TOKEN.toLowerCase()) return 18
  const raw = await provider.request({
    method: 'eth_call',
    params: [{ to: token, data: encodeData(erc20Decimals) }, 'latest'],
  })
  // decimals() returns uint8 padded to 32 bytes.
  return Number(toBigInt(raw as Hex))
}

/** Read the owner's balance of the source token (native sentinel or ERC-20). */
export const fetchSourceBalance = async ({
  provider,
  token,
  owner,
}: {
  provider: Provider.Provider
  token: Address
  owner: Address
}): Promise<bigint> => {
  if (token.toLowerCase() === NATIVE_TOKEN.toLowerCase()) {
    return getBalance({ provider, address: owner })
  }
  const raw = await provider.request({
    method: 'eth_call',
    params: [
      { to: token, data: encodeData(erc20BalanceOf, [owner]) },
      'latest',
    ],
  })
  return toBigInt(raw as Hex)
}

/** Read an ERC-20 `allowance(owner, spender)`. */
const readErc20Allowance = async ({
  provider,
  token,
  owner,
  spender,
}: {
  provider: Provider.Provider
  token: Address
  owner: Address
  spender: Address
}): Promise<bigint> => {
  const raw = await provider.request({
    method: 'eth_call',
    params: [
      { to: token, data: encodeData(erc20Allowance, [owner, spender]) },
      'latest',
    ],
  })
  return toBigInt(raw as Hex)
}

/** Read a Permit2 `allowance(owner, token, spender)` → packed amount/expiration. */
const readPermit2Allowance = async ({
  provider,
  token,
  owner,
  spender,
}: {
  provider: Provider.Provider
  token: Address
  owner: Address
  spender: Address
}): Promise<{ amount: bigint; expiration: number }> => {
  const raw = await provider.request({
    method: 'eth_call',
    params: [
      {
        to: PERMIT2_ADDRESS,
        data: encodeData(permit2Allowance, [owner, token, spender]),
      },
      'latest',
    ],
  })
  // Returns (uint160 amount, uint48 expiration, uint48 nonce); uint48 fits in
  // a JS number, so the codec yields a bigint amount and number expiration.
  const [amount, expiration] = decodeResult(permit2Allowance, raw as Hex)
  return { amount, expiration }
}

/**
 * Authorize the Squid router (`spender`) to pull `amount` of `token` from
 * `owner`.
 *
 * Squid returns one of two pull mechanisms depending on the route, and we
 * can't tell which until execution, so we set up both at the infinite sentinel
 * (each skipped on later runs when already in place):
 *
 *   1. Direct `transferFrom` — the router is `msg.sender` and calls
 *      `token.transferFrom(owner, …)`, which needs a plain ERC-20 allowance
 *      `owner → router`. Base→Filecoin routes use this; without it the source
 *      tx reverts with `TransferFailed()` ("transfer amount exceeds
 *      allowance").
 *   2. Permit2 `AllowanceTransfer` — the router pulls through Permit2, which
 *      needs an ERC-20 allowance `owner → Permit2` *and* a Permit2 allowance
 *      authorizing the router. Without the Permit2 leg those routes revert
 *      with `AllowanceExpired(0)`.
 */
export const ensureRouterAllowances = async ({
  provider,
  privateKey,
  owner,
  token,
  spender,
  amount,
  chainId,
}: {
  provider: Provider.Provider
  privateKey: Hex
  owner: Address
  token: Address
  spender: Address
  amount: bigint
  chainId: number
}): Promise<void> => {
  // Path 1: ERC-20 → router (direct transferFrom). Some routes pull with the
  // router as msg.sender, needing a plain ERC-20 allowance straight to it.
  const directAllowed = await readErc20Allowance({
    provider,
    token,
    owner,
    spender,
  })
  if (directAllowed < amount) {
    logger.info('Approving the router to spend the source token')
    const txHash = (await sendTransaction({
      provider,
      chainId,
      privateKey,
      to: token,
      data: encodeData(erc20Approve, [spender, MAX_UINT256]),
      from: owner,
    })) as Hex
    await waitForTransaction(provider, txHash)
  }

  // Path 2, step 1: ERC-20 → Permit2. Permit2 itself needs to be able to pull
  // the token, so the owner approves the Permit2 contract (not the router).
  const erc20Allowed = await readErc20Allowance({
    provider,
    token,
    owner,
    spender: PERMIT2_ADDRESS,
  })
  if (erc20Allowed < amount) {
    logger.info('Approving Permit2 to spend the source token')
    const txHash = (await sendTransaction({
      provider,
      chainId,
      privateKey,
      to: token,
      data: encodeData(erc20Approve, [PERMIT2_ADDRESS, MAX_UINT256]),
      from: owner,
    })) as Hex
    await waitForTransaction(provider, txHash)
  }

  // Path 2, step 2: Permit2 → router. Authorize the router to spend via
  // Permit2. Re-approve when the stored allowance is too small or expired.
  const nowSeconds = Math.floor(Date.now() / 1000)
  const permit2 = await readPermit2Allowance({
    provider,
    token,
    owner,
    spender,
  })
  if (permit2.amount < amount || permit2.expiration <= nowSeconds) {
    logger.info(`Authorizing ${spender} to spend via Permit2`)
    const txHash = (await sendTransaction({
      provider,
      chainId,
      privateKey,
      to: PERMIT2_ADDRESS,
      data: encodeData(permit2Approve, [
        token,
        spender,
        MAX_UINT160,
        MAX_UINT48,
      ]),
      from: owner,
    })) as Hex
    await waitForTransaction(provider, txHash)
  }
}

export type FilecoinBridgeResult = {
  /** Source-chain tx that bridged the input token to native FIL. */
  bridgeTxHash?: Hex
  /** Squid status response for the bridge leg. */
  bridgeStatus?: unknown
  /** Filecoin tx that swapped part of the FIL to USDfc. */
  swapTxHash?: Hex
  /** Native FIL credited by the bridge (human-readable, 18 decimals). */
  bridgedFil?: string
  /** Native FIL kept for gas (human-readable, 18 decimals). */
  keptFil?: string
  /** Expected USDfc from the destination swap (human-readable, 18 decimals). */
  usdfcExpected?: string
}

/** Axelar GMP explorer URL for a Squid source tx (Squid bridges via Axelar). */
const axelarGmpUrl = (txHash: Hex): string =>
  `https://axelarscan.io/gmp/${txHash}`

// Per-leg relayer poll budget. Axelar GMP to Filecoin routinely takes
// 10–30 min, well past pollSquidStatus's 10-min default, so wait ~30 min.
const LEG_POLL_MAX_ATTEMPTS = 120
const LEG_POLL_INTERVAL_MS = 15_000

/**
 * Build a poll progress logger. Verbose mode logs every attempt; otherwise it
 * stays quiet (the finality countdown handles the non-verbose heartbeat).
 */
const legProgress =
  (label: string, verbose?: boolean) =>
  (n: number, s: string | null): void => {
    if (verbose) {
      logger.info(`  ${label} poll #${n}: status=${s ?? '<none>'}`)
    }
  }

/**
 * Approximate Axelar source-chain finality wait, keyed by source chain. Axelar
 * holds a GMP message until the source chain finalizes before relaying it, and
 * that wait dominates the bridge time. Only chains with a long, fixed wait are
 * listed; the rest finalize fast enough that a countdown adds no value.
 *
 * Ethereum waits ~2 beacon epochs (~15 min), which is what axelarscan surfaces
 * as its "Waiting for finality" timer.
 */
const SOURCE_FINALITY_MS: Partial<Record<SourceChainKey, number>> = {
  eth: 15 * 60_000,
}

/** Format a millisecond span as `m:ss` for the countdown line. */
const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Run `task` (the relayer poll) while showing an Axelar-style "waiting for
 * finality" countdown for source chains with a long finality wait.
 *
 * On a TTY this rewrites a single line each second — counting 15:00 → 0:00 for
 * Ethereum, then flipping to a "finalized; waiting for relayer" elapsed timer —
 * so the wait looks like axelarscan's finality step instead of a wall of
 * repeated log lines. Off a TTY it emits one note and stays quiet. Verbose
 * mode and fast-finality chains skip the countdown entirely and defer to the
 * caller's per-poll logging.
 */
const withFinalityCountdown = async <T>(
  {
    chain,
    label,
    verbose,
  }: { chain: SourceChainKey; label: string; verbose?: boolean },
  task: () => Promise<T>,
): Promise<T> => {
  const finalityMs = SOURCE_FINALITY_MS[chain]

  // Fast-finality chains and verbose runs: nothing to animate.
  if (!finalityMs || verbose) return task()

  // Non-TTY (CI, pipes): a per-second redraw would just spam lines, so emit a
  // single note and run quietly.
  if (!process.stdout.isTTY) {
    logger.info(
      `${label} leg: waiting ~${Math.round(finalityMs / 60_000)} min for source-chain finality…`,
    )
    return task()
  }

  const startedAt = Date.now()
  const render = () => {
    const remaining = finalityMs - (Date.now() - startedAt)
    const line =
      remaining > 0
        ? `⏳ ${label} leg: waiting for finality… ${formatCountdown(remaining)} remaining`
        : `⏳ ${label} leg: finalized; waiting for relayer… ${Math.round(-remaining / 1000)}s`
    process.stdout.cursorTo(0)
    process.stdout.write(line)
    process.stdout.clearLine(1)
  }

  render()
  const timer = setInterval(render, 1_000)
  try {
    return await task()
  } finally {
    clearInterval(timer)
    // Drop the countdown line so the following success log starts clean.
    process.stdout.cursorTo(0)
    process.stdout.clearLine(0)
  }
}

/**
 * Filecoin Pay / FWSS minimum deposit for a new dataset:
 * `(minimumPricePerMonth * LOCKUP_PERIOD) / epochsPerMonth + sybil fee`.
 * Mirrors `FilecoinWarmStorageService.validatePayerOperatorApprovalAndFunds`.
 * Bridging less USDfc than this yields funds that can't pay for storage.
 */
export const computeFwssFloor = (
  minimumPricePerMonth: bigint,
  epochsPerMonth: bigint,
): bigint =>
  (minimumPricePerMonth * LOCKUP_PERIOD) / epochsPerMonth + USDFC_SYBIL_FEE

/**
 * Live FWSS minimum deposit on Filecoin mainnet (the owner can raise the
 * floor up to 0.24 USDfc/mo). Falls back to the package default (~0.16 USDfc)
 * if the on-chain pricing read fails.
 */
const fwssMinimumDeposit = async (): Promise<bigint> => {
  try {
    const pricing = await getServicePricing({ chain: filecoinMainnet })
    return computeFwssFloor(
      pricing.minimumPricePerMonth,
      pricing.epochsPerMonth,
    )
  } catch {
    return DEFAULT_MINIMUM_NEW_DATASET_LOCKUP
  }
}

/** Scale a bigint by a [0,1] ratio via 1e6 fixed point (avoids float drift). */
const applyRatio = (amount: bigint, ratio: number): bigint =>
  (amount * BigInt(Math.round(ratio * 1_000_000))) / 1_000_000n

/** Squid params for a same-chain native-FIL → USDfc swap on Filecoin. */
const filToUsdfcParams = ({
  signer,
  amount,
  slippage,
}: {
  signer: Address
  amount: bigint
  slippage: number
}): SquidRouteParams => ({
  fromAddress: signer,
  fromChain: String(FILECOIN_MAINNET.id),
  fromToken: NATIVE_TOKEN,
  fromAmount: amount.toString(),
  toChain: String(FILECOIN_MAINNET.id),
  toToken: FILECOIN_USDFC,
  toAddress: signer,
  slippage,
})

/** Throw unless a swap route's expected USDfc output clears the FWSS floor. */
const assertClearsFwssFloor = async (route: SquidRoute): Promise<void> => {
  const floor = await fwssMinimumDeposit()
  const out = BigInt(
    route.estimate.toAmountMin ?? route.estimate.toAmount ?? '0',
  )
  if (out < floor) {
    throw new Error(
      `The USDfc portion would deliver ~${Value.format(out, 18)} USDfc, below Filecoin Pay's minimum deposit of ${Value.format(floor, 18)} USDfc. Bridge a larger amount (or lower --fil-ratio) so the storage portion clears the floor.`,
    )
  }
}

/**
 * Poll Filecoin until the wallet's native FIL balance rises above `baseline`
 * and return the credited delta. Squid flags `success` a beat before the RPC
 * exposes the new balance, so a short poll avoids racing the credit.
 */
const waitForFilCredit = async ({
  provider,
  address,
  baseline,
  maxAttempts = 30,
  intervalMs = 10_000,
  verbose,
}: {
  provider: Provider.Provider
  address: Address
  baseline: bigint
  maxAttempts?: number
  intervalMs?: number
  verbose?: boolean
}): Promise<bigint> => {
  for (let i = 0; i < maxAttempts; i++) {
    const balance = await getBalance({ provider, address })
    if (balance > baseline) return balance - baseline
    if (verbose && i % 3 === 0) {
      logger.info(
        `Waiting for bridged FIL to land on Filecoin… (poll ${i + 1})`,
      )
    }
    await setTimeout(intervalMs)
  }
  throw new Error(
    'Bridged FIL did not appear on Filecoin within the expected window. It may still arrive — check your wallet before retrying.',
  )
}

/**
 * Estimate the FIL gas cost of the destination swap, with a 20% buffer. Uses
 * Squid's supplied gas limit when present (avoids a balance-sensitive
 * eth_estimateGas when the swap value is most of the balance) and the chain's
 * current base + priority fee.
 */
const estimateFilSwapGas = async ({
  provider,
  signer,
  route,
}: {
  provider: Provider.Provider
  signer: Address
  route: SquidRoute
}): Promise<bigint> => {
  const tx = route.transactionRequest
  const gasLimit = tx.gasLimit
    ? BigInt(tx.gasLimit)
    : await estimateGas({
        provider,
        to: tx.target,
        data: tx.data,
        from: signer,
        value: tx.value ? fromNumber(BigInt(tx.value)) : '0x0',
      })
  const block = await provider.request({
    method: 'eth_getBlockByNumber',
    params: ['latest', false],
  })
  const baseFee = toBigInt(block?.baseFeePerGas ?? '0x0')
  const priority = toBigInt(
    await provider.request({ method: 'eth_maxPriorityFeePerGas' }),
  )
  const maxFeePerGas = baseFee * 2n + priority
  return (gasLimit * maxFeePerGas * 12n) / 10n
}

/**
 * Bridge the input token to Filecoin as native FIL in a single Axelar hop,
 * then swap the storage portion to USDfc on Filecoin.
 *
 * Bridging to Filecoin is finality-bound — Axelar waits for source-chain
 * finality (~15 min from Ethereum, longer from some chains) — and that wait is
 * paid per bridge. Rather than bridge FIL and USDfc as two separate,
 * sequential legs (paying the wait twice), we bridge everything to native FIL
 * once, then do a fast same-chain FIL→USDfc swap on Filecoin for the storage
 * portion. One finality wait, one set of bridge fees.
 *
 * Stops once FIL + USDfc land in the wallet. Deposit the USDfc into Filecoin
 * Pay with `depositFilecoinUsdfc` afterwards (it spends the kept FIL for gas).
 */
export const bridgeFilecoin = async ({
  privateKey,
  fromChain,
  fromToken,
  amount,
  to,
  filRatio,
  slippage,
  sourceRpcUrl,
  verbose,
}: {
  privateKey: Hex
  fromChain: SourceChainKey
  fromToken: string
  amount: string
  to?: Address
  /**
   * Fraction in [0, 1] of the bridged FIL kept as native FIL for gas. The rest
   * is swapped to USDfc on Filecoin. (e.g. 0.1 ⇒ keep 10% FIL, swap 90%.)
   */
  filRatio: number
  /** Slippage in percent (Squid expects integer; 1 = 1%). */
  slippage: number
  sourceRpcUrl?: string
  verbose?: boolean
}): Promise<FilecoinBridgeResult> => {
  if (filRatio < 0 || filRatio > 1) {
    throw new Error(`--fil-ratio must be in [0, 1], got ${filRatio}`)
  }

  const signer = fromPublicKey(getPublicKey({ privateKey }))
  const destination = (to ?? signer) as Address
  // The destination FIL→USDfc swap is signed by `signer`, so the bridged FIL
  // must land in the signer's own wallet. Bridging to a third party would
  // leave funds we can't swap.
  if (destination.toLowerCase() !== signer.toLowerCase()) {
    throw new Error(
      'Bridging to Filecoin lands native FIL in your wallet and swaps part of it to USDfc on Filecoin, which must be signed from the receiving wallet. Omit --to (or set it to your own address); bridging to a different address is not supported for this flow.',
    )
  }

  const chainConfig = SOURCE_CHAINS[fromChain]
  const sourceToken = resolveSourceToken({ chain: fromChain, token: fromToken })

  const transport = fromHttp(sourceRpcUrl ?? chainConfig.rpc)
  const provider = Provider.from(transport)

  const decimals = await fetchTokenDecimals({ provider, token: sourceToken })
  let totalAmountAtomic: bigint
  try {
    totalAmountAtomic = Value.from(amount, decimals)
  } catch {
    throw new Error(`Invalid amount: ${amount}`)
  }
  if (totalAmountAtomic <= 0n)
    throw new Error(`Amount must be positive: ${amount}`)

  logger.start(
    `Bridge to Filecoin: ${amount} ${fromToken} from ${chainConfig.name}`,
  )

  // Fail fast if the wallet can't cover the bridge amount. Otherwise the
  // Squid router's Permit2.transferFrom reverts on-chain with an opaque
  // TRANSFER_FROM_FAILED — but only after we've spent gas on approvals.
  const sourceBalance = await fetchSourceBalance({
    provider,
    token: sourceToken,
    owner: signer,
  })
  if (sourceBalance < totalAmountAtomic) {
    throw new Error(`Insufficient ${fromToken} on ${chainConfig.name}`)
  }

  // Single bridge leg: input token → native FIL on Filecoin. Bridging
  // everything as FIL (then swapping the storage portion to USDfc on Filecoin)
  // pays Axelar's source-finality wait once, not twice.
  const bridgeParams: SquidRouteParams = {
    fromAddress: signer,
    fromChain: String(chainConfig.id),
    fromToken: sourceToken,
    fromAmount: totalAmountAtomic.toString(),
    toChain: String(FILECOIN_MAINNET.id),
    toToken: NATIVE_TOKEN,
    toAddress: signer,
    slippage,
  }
  const bridgeRoute = await getRouteWithRetry({ params: bridgeParams })
  if (verbose) logRouteSummary('bridge→FIL', bridgeRoute)

  // Preflight the storage floor before any on-chain action: from the bridge's
  // expected FIL out, quote the FIL→USDfc swap at the storage split and ensure
  // it clears Filecoin Pay's minimum deposit. Fails fast on under-funding.
  const expectedFil = BigInt(
    bridgeRoute.estimate.toAmountMin ?? bridgeRoute.estimate.toAmount ?? '0',
  )
  const preflightSwapIn = applyRatio(expectedFil, 1 - filRatio)
  if (preflightSwapIn > 0n) {
    await assertClearsFwssFloor(
      await getRouteWithRetry({
        params: filToUsdfcParams({ signer, amount: preflightSwapIn, slippage }),
      }),
    )
  }

  // For ERC-20 inputs, authorize the Squid router for the total. The route may
  // pull via a direct transferFrom or via Permit2, so we set up both (see
  // ensureRouterAllowances). Native inputs skip this.
  const isNative = sourceToken.toLowerCase() === NATIVE_TOKEN.toLowerCase()
  if (!isNative) {
    await ensureRouterAllowances({
      provider,
      privateKey,
      owner: signer,
      token: sourceToken,
      spender: bridgeRoute.transactionRequest.target as Address,
      amount: totalAmountAtomic,
      chainId: chainConfig.id,
    })
  }

  const result: FilecoinBridgeResult = {}
  const fil = filProvider[filecoinMainnet.id]
  const filBefore = await getBalance({ provider: fil, address: signer })

  // --- Bridge leg: input token → native FIL on Filecoin ---
  logger.info(`Executing bridge on ${chainConfig.name}`)
  const bridgeTxHash = await executeRoute({
    provider,
    privateKey,
    chainId: chainConfig.id,
    signer,
    route: bridgeRoute,
  })
  logger.info(`Bridge tx: ${chainConfig.explorer}/tx/${bridgeTxHash}`)
  await waitForTransaction(provider, bridgeTxHash)
  logger.info('Bridge source tx confirmed; polling relayer…')
  logger.info(`Track: ${axelarGmpUrl(bridgeTxHash)}`)
  result.bridgeStatus = await withFinalityCountdown(
    { chain: fromChain, label: 'bridge', verbose },
    () =>
      pollSquidStatus({
        transactionId: bridgeTxHash,
        requestId: bridgeRoute.params?.requestId,
        fromChainId: String(chainConfig.id),
        toChainId: String(FILECOIN_MAINNET.id),
        maxAttempts: LEG_POLL_MAX_ATTEMPTS,
        intervalMs: LEG_POLL_INTERVAL_MS,
        onAttempt: legProgress('bridge', verbose),
      }),
  )
  result.bridgeTxHash = bridgeTxHash
  logger.success('Bridged to native FIL')

  // Measure what actually landed (quote ≠ exact; balance lags `success`).
  const bridgedFil = await waitForFilCredit({
    provider: fil,
    address: signer,
    baseline: filBefore,
    verbose,
  })
  result.bridgedFil = Value.format(bridgedFil, 18)
  logger.info(`Received ${Value.format(bridgedFil, 18)} FIL`)

  // --- Destination swap: keep `filRatio` of the FIL for gas, swap the rest ---
  let swapIn = applyRatio(bridgedFil, 1 - filRatio)
  let keptFil = bridgedFil - swapIn
  if (swapIn <= 0n) {
    logger.warn('--fil-ratio leaves nothing to swap; keeping all FIL')
    result.keptFil = Value.format(bridgedFil, 18)
    logger.success('Filecoin bridge complete')
    return result
  }

  let swapRoute = await getRouteWithRetry({
    params: filToUsdfcParams({ signer, amount: swapIn, slippage }),
  })

  // Ensure the kept FIL covers the swap's gas; if not, swap less so the tx can
  // land (and leave gas for the later Filecoin Pay deposit).
  const gasReserve = await estimateFilSwapGas({
    provider: fil,
    signer,
    route: swapRoute,
  })
  if (keptFil < gasReserve) {
    if (bridgedFil <= gasReserve) {
      throw new Error(
        `Received FIL (${Value.format(bridgedFil, 18)}) can't cover the on-chain swap gas (~${Value.format(gasReserve, 18)} FIL). Bridge a larger amount.`,
      )
    }
    swapIn = bridgedFil - gasReserve
    keptFil = gasReserve
    swapRoute = await getRouteWithRetry({
      params: filToUsdfcParams({ signer, amount: swapIn, slippage }),
    })
  }
  if (verbose) logRouteSummary('FIL→USDfc', swapRoute)

  // We've already bridged, so don't strand the user in raw FIL: if the swap
  // would land below Filecoin Pay's floor, warn but still swap to USDfc.
  const expectedUsdfc = BigInt(
    swapRoute.estimate.toAmountMin ?? swapRoute.estimate.toAmount ?? '0',
  )
  const floor = await fwssMinimumDeposit()
  if (expectedUsdfc < floor) {
    logger.warn(
      `Swap will yield ~${Value.format(expectedUsdfc, 18)} USDfc, below Filecoin Pay's ${Value.format(floor, 18)} USDfc minimum deposit. Proceeding — top up before depositing for storage.`,
    )
  }

  logger.info(
    `Swapping ${Value.format(swapIn, 18)} FIL → USDfc on Filecoin (keeping ${Value.format(keptFil, 18)} FIL for gas)`,
  )
  const swapTxHash = await executeRoute({
    provider: fil,
    privateKey,
    chainId: filecoinMainnet.id,
    signer,
    route: swapRoute,
  })
  logger.info(`Swap tx: ${FILECOIN_MAINNET.explorer}/tx/${swapTxHash}`)
  await waitForTransaction(fil, swapTxHash)
  logger.success('Swapped FIL → USDfc on Filecoin')
  result.swapTxHash = swapTxHash
  result.keptFil = Value.format(keptFil, 18)
  result.usdfcExpected = Value.format(expectedUsdfc, 18)

  logger.success('Filecoin bridge complete')
  return result
}

const executeRoute = async ({
  provider,
  privateKey,
  chainId,
  signer,
  route,
}: {
  provider: Provider.Provider
  privateKey: Hex
  chainId: number
  signer: Address
  route: SquidRoute
}): Promise<Hex> => {
  const tx = route.transactionRequest
  const value = tx.value ? BigInt(tx.value) : 0n
  return (await sendTransaction({
    provider,
    chainId,
    privateKey,
    to: tx.target,
    data: tx.data,
    from: signer,
    value,
  })) as Hex
}

const logRouteSummary = (label: string, route: SquidRoute) => {
  const est = route.estimate
  const actions = (est.actions ?? [])
    .map(
      (a) =>
        `${a.type}(${a.fromToken?.symbol ?? '?'} → ${a.toToken?.symbol ?? '?'})`,
    )
    .join(' / ')
  logger.info(
    `  ${label}: $${est.fromAmountUSD} → $${est.toAmountUSD} (${est.estimatedRouteDuration}s) [${actions}]`,
  )
}
