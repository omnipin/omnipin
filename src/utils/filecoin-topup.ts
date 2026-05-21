import { encodeData } from 'ox/AbiFunction'
import { type Address, fromPublicKey } from 'ox/Address'
import { type Hex, toBigInt } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import * as Value from 'ox/Value'
import {
  depositWithPermitAndApproveOperatorWriteParameters,
  depositWithPermitWriteParameters,
  getUSDfcBalance,
  isFwssMaxApproved,
} from '@omnipin/foc/fil-pay'
import { filecoinMainnet, filProvider } from '@omnipin/foc/utils'
import { logger } from './logger.js'
import {
  getRouteWithRetry,
  NATIVE_TOKEN,
  pollSquidStatus,
  type SquidRoute,
  type SquidRouteParams,
} from './squid.js'
import { sendTransaction, waitForTransaction } from './tx.js'
import { setTimeout } from '../deps.js'

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

export type SourceChainId = 1 | 10 | 56 | 137 | 8453 | 42161 | 43114

export type SourceChainKey =
  | 'eth'
  | 'opt'
  | 'bsc'
  | 'polygon'
  | 'base'
  | 'arb'
  | 'avalanche'

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
  avalanche: {
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

/** Ensure the Squid router has an allowance >= amount; approve max if not. */
const ensureAllowance = async ({
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
  const raw = await provider.request({
    method: 'eth_call',
    params: [
      { to: token, data: encodeData(erc20Allowance, [owner, spender]) },
      'latest',
    ],
  })
  const current = toBigInt(raw as Hex)
  if (current >= amount) return

  logger.info(`Approving ${spender} to spend the source token`)
  // Approve max uint256 once to avoid repeated approvals for split topups.
  const max = 2n ** 256n - 1n
  const data = encodeData(erc20Approve, [spender, max])
  const txHash = (await sendTransaction({
    provider,
    chainId,
    privateKey,
    to: token,
    data,
    from: owner,
  })) as Hex
  await waitForTransaction(provider, txHash)
}

export type FilecoinTopupResult = {
  /** Source-chain transaction that triggered the USDfc bridge leg. */
  usdfcTxHash?: Hex
  /** Source-chain transaction that triggered the FIL bridge leg. */
  filTxHash?: Hex
  /** Squid status response for each leg. */
  usdfcStatus?: unknown
  filStatus?: unknown
}

/**
 * Top up Filecoin: bridge a portion of the input token to native FIL (gas)
 * and the rest to USDfc (storage payment) via Squid Router.
 */
export const topupFilecoin = async ({
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
}): Promise<FilecoinTopupResult> => {
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
    `Top-up Filecoin: ${amount} ${fromToken} from ${chainConfig.name} → ${destination}`,
  )
  logger.info(
    `Split: ${filAtomic} (FIL leg) + ${usdfcAtomic} (USDfc leg), source-token atomic units`,
  )

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

  // For ERC-20 inputs, approve the Squid router for the *total* once.
  const isNative = sourceToken.toLowerCase() === NATIVE_TOKEN.toLowerCase()
  if (!isNative) {
    const spender = (filRoute?.transactionRequest.target ??
      usdfcRoute!.transactionRequest.target) as Address
    await ensureAllowance({
      provider,
      privateKey,
      owner: signer,
      token: sourceToken,
      spender,
      amount: totalAmountAtomic,
      chainId: chainConfig.id,
    })
  }

  const result: FilecoinTopupResult = {}

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
    const status = await pollSquidStatus({
      transactionId: txHash,
      requestId: filRoute.params?.requestId,
      fromChainId: String(chainConfig.id),
      toChainId: String(FILECOIN_MAINNET.id),
      onAttempt: (n, s) => {
        if (verbose) logger.info(`  FIL poll #${n}: status=${s ?? '<none>'}`)
      },
    })
    logger.success('FIL leg bridged')
    result.filTxHash = txHash
    result.filStatus = status
  }

  if (usdfcRoute && usdfcParams) {
    logger.info(`Executing USDfc leg on ${chainConfig.name}`)
    const txHash = await executeRoute({
      provider,
      privateKey,
      chainId: chainConfig.id,
      signer,
      route: usdfcRoute,
    })
    logger.info(`USDfc leg tx: ${chainConfig.explorer}/tx/${txHash}`)
    await waitForTransaction(provider, txHash)
    logger.info('USDfc leg source tx confirmed; polling relayer…')
    const status = await pollSquidStatus({
      transactionId: txHash,
      requestId: usdfcRoute.params?.requestId,
      fromChainId: String(chainConfig.id),
      toChainId: String(FILECOIN_MAINNET.id),
      onAttempt: (n, s) => {
        if (verbose) logger.info(`  USDfc poll #${n}: status=${s ?? '<none>'}`)
      },
    })
    logger.success('USDfc leg bridged')
    result.usdfcTxHash = txHash
    result.usdfcStatus = status
  }

  // Deposit bridged USDfc to Filecoin Pay
  if (usdfcAtomic > 0n) {
    logger.info('Waiting for USDfc balance to arrive on Filecoin…')
    const usdfcBalance = await waitForUsdfcBalance({
      address: destination,
      minimumWei: usdfcAtomic,
      verbose,
    })

    logger.info(
      `Depositing ${Value.format(usdfcBalance, 18)} USDfc to Filecoin Pay`,
    )

    const alreadyApproved = await isFwssMaxApproved({
      clientAddress: destination,
      chain: filecoinMainnet,
    })

    const params = alreadyApproved
      ? await depositWithPermitWriteParameters({
          privateKey,
          address: destination,
          amount: usdfcBalance,
          chain: filecoinMainnet,
        })
      : await depositWithPermitAndApproveOperatorWriteParameters({
          privateKey,
          address: destination,
          amount: usdfcBalance,
          chain: filecoinMainnet,
        })

    const depositHash = (await sendTransaction({
      ...params,
      chainId: filecoinMainnet.id,
      privateKey,
    })) as Hex

    logger.info(
      `Deposit tx: ${FILECOIN_MAINNET.explorer}/tx/${depositHash}`,
    )

    await waitForTransaction(filProvider[filecoinMainnet.id], depositHash)
    logger.success('Deposit confirmed')
  }

  logger.success('Filecoin top-up complete')
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

/**
 * Poll Filecoin RPC until the address's USDfc balance reaches at least
 * `minimumWei`. The Squid relayer reports `success` as soon as the
 * destination tx is mined, but some RPC providers lag by a few seconds
 * before exposing the new balance.
 */
const waitForUsdfcBalance = async ({
  address,
  minimumWei,
  maxAttempts = 60,
  intervalMs = 10_000,
  verbose,
}: {
  address: Address
  minimumWei: bigint
  maxAttempts?: number
  intervalMs?: number
  verbose?: boolean
}): Promise<bigint> => {
  for (let i = 0; i < maxAttempts; i++) {
    const balance = await getUSDfcBalance({
      address,
      chain: filecoinMainnet,
    })
    if (balance >= minimumWei) return balance
    if (verbose && i % 5 === 0) {
      logger.info(
        `Waiting for USDfc balance (have ${Value.format(balance, 18)}, need ${Value.format(minimumWei, 18)})`,
      )
    }
    await setTimeout(intervalMs)
  }
  throw new Error(
    `USDfc balance did not reach ${Value.format(minimumWei, 18)} within ${maxAttempts} polls`,
  )
}
