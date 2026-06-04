import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type Address, fromPublicKey } from 'ox/Address'
import { type Hex, toBigInt } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import * as Value from 'ox/Value'
import { logger } from './logger.js'
import {
  getRouteWithRetry,
  NATIVE_TOKEN,
  pollSquidStatus,
  type SquidRoute,
  type SquidRouteParams,
} from './squid.js'
import { getBalance, sendTransaction, waitForTransaction } from './tx.js'

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
 * {@link ensurePermit2Allowance}.
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
 * Authorize `spender` (the Squid router) to pull `amount` of `token` from
 * `owner` via Permit2.
 *
 * Squid's router pulls ERC-20 inputs through Permit2's `AllowanceTransfer`
 * module, not a plain `transferFrom`. That needs two distinct approvals:
 *
 *   1. ERC-20 `approve(PERMIT2, max)` — lets the Permit2 contract move the
 *      token on the owner's behalf.
 *   2. Permit2 `approve(token, spender, amount, expiration)` — authorizes the
 *      router to spend through Permit2 until `expiration`.
 *
 * Approving the router directly on the ERC-20 (the pre-Permit2 pattern) leaves
 * the Permit2 allowance unset, so the router's `Permit2.transferFrom` reverts
 * with `AllowanceExpired(0)`. Both approvals are issued at the infinite
 * sentinel once and skipped on subsequent runs when already in place.
 */
export const ensurePermit2Allowance = async ({
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
  // Step 1: ERC-20 → Permit2. Permit2 itself needs to be able to pull the
  // token, so the owner approves the Permit2 contract (not the router).
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

  // Step 2: Permit2 → router. Authorize the Squid router to spend via Permit2.
  // Re-approve when the stored allowance is too small or already expired.
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
  /** Source-chain transaction that triggered the USDfc bridge leg. */
  usdfcTxHash?: Hex
  /** Source-chain transaction that triggered the FIL bridge leg. */
  filTxHash?: Hex
  /** Squid status response for each leg. */
  usdfcStatus?: unknown
  filStatus?: unknown
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
 * emits a heartbeat roughly once a minute so the wait never looks frozen.
 */
const legProgress =
  (label: string, startedAt: number, verbose?: boolean) =>
  (n: number, s: string | null): void => {
    if (verbose) {
      logger.info(`  ${label} poll #${n}: status=${s ?? '<none>'}`)
    } else if (n % 4 === 0) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      logger.info(
        `Still bridging ${label} leg… ${elapsed}s elapsed (relayer: ${s ?? 'pending'})`,
      )
    }
  }

/**
 * Bridge a portion of the input token to native FIL (gas) and the rest to
 * USDfc (storage payment) on Filecoin via Squid Router.
 *
 * This stops once the funds land in the destination wallet. To deposit the
 * bridged USDfc into Filecoin Pay (so the `Filecoin` IPFS provider can spend
 * it on storage), call `depositFilecoinUsdfc` afterwards.
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
  /** Fraction in [0, 1] of the input value sent to FIL. Rest goes to USDfc. */
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

  // Compute the per-leg amounts. We scale via a 1e6 fixed-point ratio to
  // avoid floating-point sloppiness in the split arithmetic.
  const ratioBp = Math.round(filRatio * 1_000_000)
  const filAtomic = (totalAmountAtomic * BigInt(ratioBp)) / 1_000_000n
  const usdfcAtomic = totalAmountAtomic - filAtomic

  logger.start(
    `Bridge to Filecoin: ${amount} ${fromToken} from ${chainConfig.name} → ${destination}`,
  )
  logger.info(
    `Split: ${Value.format(filAtomic, decimals)} ${fromToken} → FIL + ${Value.format(usdfcAtomic, decimals)} ${fromToken} → USDfc`,
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

  // Quote both legs ahead of time so we surface route errors before any
  // on-chain action.
  const filParams: SquidRouteParams | undefined =
    filAtomic > 0n
      ? {
          fromAddress: signer,
          fromChain: String(chainConfig.id),
          fromToken: sourceToken,
          fromAmount: filAtomic.toString(),
          toChain: String(FILECOIN_MAINNET.id),
          toToken: NATIVE_TOKEN,
          toAddress: destination,
          slippage,
        }
      : undefined

  const usdfcParams: SquidRouteParams | undefined =
    usdfcAtomic > 0n
      ? {
          fromAddress: signer,
          fromChain: String(chainConfig.id),
          fromToken: sourceToken,
          fromAmount: usdfcAtomic.toString(),
          toChain: String(FILECOIN_MAINNET.id),
          toToken: FILECOIN_USDFC,
          toAddress: destination,
          slippage,
        }
      : undefined

  const filRoute = filParams
    ? await getRouteWithRetry({ params: filParams })
    : undefined
  const usdfcRoute = usdfcParams
    ? await getRouteWithRetry({ params: usdfcParams })
    : undefined

  if (verbose) {
    if (filRoute) logRouteSummary('FIL', filRoute)
    if (usdfcRoute) logRouteSummary('USDfc', usdfcRoute)
  }

  // For ERC-20 inputs, set up Permit2 for the Squid router for the *total*
  // once. Squid pulls funds via Permit2, so a plain ERC-20 approval to the
  // router is not enough (see ensurePermit2Allowance).
  const isNative = sourceToken.toLowerCase() === NATIVE_TOKEN.toLowerCase()
  if (!isNative) {
    const spender = (filRoute?.transactionRequest.target ??
      usdfcRoute?.transactionRequest.target) as Address
    await ensurePermit2Allowance({
      provider,
      privateKey,
      owner: signer,
      token: sourceToken,
      spender,
      amount: totalAmountAtomic,
      chainId: chainConfig.id,
    })
  }

  const result: FilecoinBridgeResult = {}

  if (filRoute && filParams) {
    logger.info(`Executing FIL leg on ${chainConfig.name}`)
    const txHash = await executeRoute({
      provider,
      privateKey,
      chainId: chainConfig.id,
      signer,
      route: filRoute,
    })
    logger.info(`FIL leg tx: ${chainConfig.explorer}/tx/${txHash}`)
    await waitForTransaction(provider, txHash)
    logger.info('FIL leg source tx confirmed; polling relayer…')
    logger.info(`Track: ${axelarGmpUrl(txHash)}`)
    const status = await pollSquidStatus({
      transactionId: txHash,
      requestId: filRoute.params?.requestId,
      fromChainId: String(chainConfig.id),
      toChainId: String(FILECOIN_MAINNET.id),
      maxAttempts: LEG_POLL_MAX_ATTEMPTS,
      intervalMs: LEG_POLL_INTERVAL_MS,
      onAttempt: legProgress('FIL', Date.now(), verbose),
    })
    logger.success('FIL leg bridged')
    result.filTxHash = txHash
    result.filStatus = status
  }

  if (usdfcRoute && usdfcParams) {
    logger.info(`Executing USDfc leg on ${chainConfig.name}`)
    // Re-quote right before executing. The up-front quote is stale by now —
    // the FIL leg's relayer wait (~16 min from Ethereum) outlives Squid's
    // quote, so the route's embedded minimum-output no longer holds and the
    // source swap reverts with `CallFailed(_, "Too little received")`. A fresh
    // quote restores a valid slippage bound for current prices.
    const freshRoute = await getRouteWithRetry({ params: usdfcParams })
    const txHash = await executeRoute({
      provider,
      privateKey,
      chainId: chainConfig.id,
      signer,
      route: freshRoute,
    })
    logger.info(`USDfc leg tx: ${chainConfig.explorer}/tx/${txHash}`)
    await waitForTransaction(provider, txHash)
    logger.info('USDfc leg source tx confirmed; polling relayer…')
    logger.info(`Track: ${axelarGmpUrl(txHash)}`)
    const status = await pollSquidStatus({
      transactionId: txHash,
      requestId: freshRoute.params?.requestId,
      fromChainId: String(chainConfig.id),
      toChainId: String(FILECOIN_MAINNET.id),
      maxAttempts: LEG_POLL_MAX_ATTEMPTS,
      intervalMs: LEG_POLL_INTERVAL_MS,
      onAttempt: legProgress('USDfc', Date.now(), verbose),
    })
    logger.success('USDfc leg bridged')
    result.usdfcTxHash = txHash
    result.usdfcStatus = status
  }

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
