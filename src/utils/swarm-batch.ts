import { from as eventFrom, getSelector as getEventSelector } from 'ox/AbiEvent'
import { decodeResult, encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { fromPublicKey } from 'ox/Address'
import { type Hex, toBigInt } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey } from 'ox/Secp256k1'
import { randomBytes } from '../deps.js'
import { logger } from './logger.js'
import { sendTransaction, waitForTransaction } from './tx.js'

// ─── Chain ────────────────────────────────────────────────────────────────────

export const GNOSIS = {
  id: 100,
  name: 'Gnosis',
  rpc: 'https://rpc.gnosischain.com',
  explorer: 'https://gnosisscan.io',
}

/** Block time on Gnosis chain (seconds). Used for postage-stamp amount math. */
const GNOSIS_BLOCK_TIME = 5n

// ─── Contracts ────────────────────────────────────────────────────────────────

/** BZZ ERC-20 on Gnosis. */
export const BZZ_TOKEN: Address = '0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da'

/** Wrapped xDAI on Gnosis (used as the final hop in Beeport's exact-output path). */
export const WXDAI: Address = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d'

/**
 * Beeport's SushiSwapStampsRouter on Gnosis. Wraps the canonical PostageStamp
 * and lets callers swap any token (or native xDAI) → BZZ in one tx.
 */
export const BEEPORT_REGISTRY: Address =
  '0xf244cC25EAD03a99de8B407A3237aaf54D1b779C'

/**
 * StampsRegistry wrapper that Beeport's router delegates to. Routes
 * `createBatchRegistry` calls into the canonical PostageStamp.
 */
export const STAMPS_REGISTRY: Address =
  '0x5EBfBeFB1E88391eFb022d5d33302f50a46bF4f3'

/** Canonical Swarm PostageStamp on Gnosis (price oracle + batch ledger). */
export const POSTAGE_STAMP: Address =
  '0x45a1502382541Cd610CC9068e88727426b696293'

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const lastPriceAbi = {
  name: 'lastPrice',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'uint64' }],
} as const

const minInitialBalancePerChunkAbi = {
  name: 'minimumInitialBalancePerChunk',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'uint256' }],
} as const

const erc20BalanceOfAbi = {
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ type: 'uint256' }],
} as const

const erc20ApproveAbi = {
  name: 'approve',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ type: 'bool' }],
} as const

/**
 * `getOwnerBatches(address)` on the StampsRegistry. Returns every batch the
 * given address has paid for via the registry (i.e. via Beeport's router).
 */
const getOwnerBatchesAbi = {
  name: 'getOwnerBatches',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: '_owner', type: 'address' }],
  outputs: [
    {
      type: 'tuple[]',
      components: [
        { name: 'batchId', type: 'bytes32' },
        { name: 'totalAmount', type: 'uint256' },
        { name: 'normalisedBalance', type: 'uint256' },
        { name: 'nodeAddress', type: 'address' },
        { name: 'payer', type: 'address' },
        { name: 'depth', type: 'uint8' },
        { name: 'bucketDepth', type: 'uint8' },
        { name: 'immutable_', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    },
  ],
} as const

/** `remainingBalance(bytes32)` on the canonical PostageStamp. */
const remainingBalanceAbi = {
  name: 'remainingBalance',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: '_batchId', type: 'bytes32' }],
  outputs: [{ type: 'uint256' }],
} as const

/**
 * `quoteSingleHop(address,uint24,uint256)` on Beeport's router. State-changing
 * by signature (the underlying Quoter mutates), but designed to be called via
 * `eth_call` for free off-chain estimation.
 */
const quoteSingleHopAbi = {
  name: 'quoteSingleHop',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'tokenIn', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'bzzAmountOut', type: 'uint256' },
  ],
  outputs: [{ name: 'amountIn', type: 'uint256' }],
} as const

/** `createBatch(address,uint256,uint8,uint8,bytes32,bool)` on the canonical PostageStamp. */
const createBatchAbi = {
  name: 'createBatch',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: '_owner', type: 'address' },
    { name: '_initialBalancePerChunk', type: 'uint256' },
    { name: '_depth', type: 'uint8' },
    { name: '_bucketDepth', type: 'uint8' },
    { name: '_nonce', type: 'bytes32' },
    { name: '_immutable', type: 'bool' },
  ],
  outputs: [],
} as const

/** `createBatchNative(bytes,uint256,uint256,(...))` on Beeport's router. */
const createBatchNativeAbi = {
  name: 'createBatchNative',
  type: 'function',
  stateMutability: 'payable',
  inputs: [
    { name: 'path', type: 'bytes' },
    { name: 'maxAmountIn', type: 'uint256' },
    { name: 'bzzAmountOut', type: 'uint256' },
    {
      name: 'p',
      type: 'tuple',
      components: [
        { name: 'owner', type: 'address' },
        { name: 'nodeAddress', type: 'address' },
        { name: 'initialBalancePerChunk', type: 'uint256' },
        { name: 'depth', type: 'uint8' },
        { name: 'bucketDepth', type: 'uint8' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'immutable_', type: 'bool' },
      ],
    },
  ],
  outputs: [],
} as const

/** Event emitted by Beeport's router on successful batch creation. */
const batchCreatedViaSwapEvent = eventFrom(
  'event BatchCreatedViaSwap(bytes32 indexed batchId, address indexed owner, address tokenIn, uint256 amountIn, uint256 bzzAmount)',
)
const BATCH_CREATED_VIA_SWAP_TOPIC = getEventSelector(batchCreatedViaSwapEvent)

/** Event emitted by the canonical PostageStamp on `createBatch`. */
const batchCreatedEvent = eventFrom(
  'event BatchCreated(bytes32 indexed batchId, uint256 totalAmount, uint256 normalisedBalance, address owner, uint8 depth, uint8 bucketDepth, bool immutableFlag)',
)
const BATCH_CREATED_TOPIC = getEventSelector(batchCreatedEvent)

// ─── Sizing helpers ───────────────────────────────────────────────────────────

/**
 * Effective storage size in bytes for a given depth, assuming `ENCRYPTION_OFF`
 * and `REDUNDANCY_OFF` (matches what omnipin uploads as static websites).
 *
 * Derived from `bee-js`'s capacity breakpoints table.
 */
const EFFECTIVE_SIZE_BREAKPOINTS_BYTES: ReadonlyArray<
  [depth: number, bytes: bigint]
> = [
  [17, 44_700n],
  [18, 6_660_000n],
  [19, 112_060_000n],
  [20, 687_620_000n],
  [21, 3_220_000_000n],
  [22, 13_730_000_000n],
  [23, 56_010_000_000n],
  [24, 224_730_000_000n],
  [25, 896_550_000_000n],
  [26, 3_582_320_000_000n],
  [27, 14_322_320_000_000n],
  [28, 57_278_140_000_000n],
  [29, 229_098_280_000_000n],
  [30, 916_366_220_000_000n],
  [31, 3_665_437_700_000_000n],
  [32, 14_661_727_950_000_000n],
  [33, 58_646_846_650_000_000n],
  [34, 234_587_280_180_000_000n],
]

/**
 * Smallest postage-stamp depth whose effective volume covers the requested
 * number of bytes. Falls back to the maximum depth if nothing fits.
 */
export const getDepthForSize = (sizeBytes: bigint): number => {
  for (const [depth, capacity] of EFFECTIVE_SIZE_BREAKPOINTS_BYTES) {
    if (capacity >= sizeBytes) return depth
  }
  // The table is non-empty (declared as a const literal), so `at(-1)` is
  // guaranteed to return a value here.
  const last = EFFECTIVE_SIZE_BREAKPOINTS_BYTES.at(-1)
  if (!last) throw new Error('Empty depth table')
  return last[0]
}

/** Bucket depth for postage stamps. Standard value. */
export const DEFAULT_BUCKET_DEPTH = 16

/** Default storage capacity used by the deploy flow's auto-batch-purchase. */
export const DEFAULT_BATCH_SIZE_BYTES = 110n * 1024n * 1024n // 110 MB

/** Default batch duration used by the deploy flow's auto-batch-purchase. */
export const DEFAULT_BATCH_DURATION_SECONDS = 30n * 24n * 60n * 60n // 30 days

// ─── Size / duration parsing ─────────────────────────────────────────────────

/** Parse e.g. `"110MB"`, `"1.5GB"`, `"512KiB"`, or a plain byte count. */
export const parseSize = (input: string): bigint => {
  const m = input
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(B|KB|KIB|MB|MIB|GB|GIB|TB|TIB)?$/i)
  if (!m || m[1] === undefined) throw new Error(`Invalid size: ${input}`)
  const n = Number.parseFloat(m[1])
  const unit = (m[2] ?? 'B').toUpperCase()
  const mult: Record<string, bigint> = {
    B: 1n,
    KB: 1000n,
    KIB: 1024n,
    MB: 1000n * 1000n,
    MIB: 1024n * 1024n,
    GB: 1000n * 1000n * 1000n,
    GIB: 1024n * 1024n * 1024n,
    TB: 1000n ** 4n,
    TIB: 1024n ** 4n,
  }
  // Convert via Number → BigInt; safe for sizes up to ~Number.MAX_SAFE_INTEGER
  // bytes (≈9 PB), more than enough for any postage stamp use case.
  return BigInt(Math.floor(n * Number(mult[unit] ?? 1n)))
}

/** Parse e.g. `"30d"`, `"24h"`, `"3600s"`, `"2w"`, or a plain second count. */
export const parseDuration = (input: string): bigint => {
  const m = input.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)?$/i)
  if (!m || m[1] === undefined) throw new Error(`Invalid duration: ${input}`)
  const n = Number.parseFloat(m[1])
  const unit = (m[2] ?? 's').toLowerCase()
  const mult: Record<string, bigint> = {
    s: 1n,
    m: 60n,
    h: 3600n,
    d: 86_400n,
    w: 604_800n,
  }
  return BigInt(Math.floor(n * Number(mult[unit] ?? 1n)))
}

// ─── On-chain reads ───────────────────────────────────────────────────────────

const callUint = async ({
  provider,
  to,
  data,
}: {
  provider: Provider.Provider
  to: Address
  data: Hex
}): Promise<bigint> => {
  const res = (await provider.request({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  })) as Hex
  return toBigInt(res)
}

/** Current per-chunk-per-block price (PLUR). */
export const getLastPrice = (provider: Provider.Provider): Promise<bigint> =>
  callUint({
    provider,
    to: POSTAGE_STAMP,
    data: encodeData(lastPriceAbi),
  })

/** Per-chunk amount needed to make a brand-new batch valid. */
export const getMinimumInitialBalancePerChunk = (
  provider: Provider.Provider,
): Promise<bigint> =>
  callUint({
    provider,
    to: POSTAGE_STAMP,
    data: encodeData(minInitialBalancePerChunkAbi),
  })

/** BZZ balance of an account. */
export const getBzzBalance = ({
  provider,
  account,
}: {
  provider: Provider.Provider
  account: Address
}): Promise<bigint> =>
  callUint({
    provider,
    to: BZZ_TOKEN,
    data: encodeData(erc20BalanceOfAbi, [account]),
  })

/**
 * Amount per chunk required to cover `durationSeconds` at the current
 * `lastPrice`, including the +1 PLUR safety margin that the canonical
 * contract requires above `minimumInitialBalancePerChunk`.
 */
export const getAmountForDuration = async ({
  provider,
  durationSeconds,
}: {
  provider: Provider.Provider
  durationSeconds: bigint
}): Promise<bigint> => {
  const lastPrice = await getLastPrice(provider)
  const blocks = durationSeconds / GNOSIS_BLOCK_TIME
  const minimum = await getMinimumInitialBalancePerChunk(provider)
  const computed = blocks * lastPrice + 1n
  return computed > minimum ? computed : minimum
}

/**
 * Single batch entry returned by `StampsRegistry.getOwnerBatches`.
 */
export type OwnedBatch = {
  batchId: Hex
  totalAmount: bigint
  normalisedBalance: bigint
  nodeAddress: Address
  payer: Address
  depth: number
  bucketDepth: number
  immutable: boolean
  timestamp: bigint
  /** Live remaining per-chunk balance, fetched separately. */
  remainingBalance: bigint
}

/**
 * List every batch the given address has paid for via the StampsRegistry,
 * along with each batch's live `remainingBalance`. Batches with zero balance
 * have expired and cannot be used to upload.
 */
export const getOwnedBatches = async ({
  provider,
  account,
}: {
  provider: Provider.Provider
  account: Address
}): Promise<OwnedBatch[]> => {
  const raw = await provider.request({
    method: 'eth_call',
    params: [
      {
        to: STAMPS_REGISTRY,
        data: encodeData(getOwnerBatchesAbi, [account]),
      },
      'latest',
    ],
  })
  const entries = decodeResult(getOwnerBatchesAbi, raw)
  if (entries.length === 0) return []

  const remaining = await Promise.all(
    entries.map((e) =>
      callUint({
        provider,
        to: POSTAGE_STAMP,
        data: encodeData(remainingBalanceAbi, [e.batchId]),
      }).catch(() => 0n),
    ),
  )

  return entries.map((e, i) => ({
    batchId: e.batchId,
    totalAmount: e.totalAmount,
    normalisedBalance: e.normalisedBalance,
    nodeAddress: e.nodeAddress,
    payer: e.payer,
    depth: e.depth,
    bucketDepth: e.bucketDepth,
    immutable: e.immutable_,
    timestamp: e.timestamp,
    remainingBalance: remaining[i] ?? 0n,
  }))
}

/**
 * Ask the Bee node whether a batch is ready to accept uploads.
 *
 * A batch can exist on-chain (and in the StampsRegistry) without the Bee node
 * having indexed it yet, or it may correspond to a failed Beeport swap where
 * the registry recorded the entry but the canonical PostageStamp never
 * finalised it. `/stamps/<id>` returning `usable: true` is the authoritative
 * signal that uploads will succeed.
 */
const isBatchUsableOnBee = async ({
  beeURL,
  batchId,
}: {
  beeURL: string
  batchId: Hex
}): Promise<boolean> => {
  try {
    const res = await fetch(
      `${beeURL.replace(/\/$/, '')}/stamps/${batchId.replace(/^0x/, '')}`,
    )
    if (!res.ok) return false
    const json = (await res.json()) as { usable?: boolean }
    return json.usable === true
  } catch {
    return false
  }
}

/**
 * Find the best already-purchased batch usable for an upload of `sizeBytes`.
 *
 * "Usable" means: still has live remaining balance, was sized for at least
 * `sizeBytes`, and — if `beeURL` is provided — the Bee node confirms the
 * batch is `usable`.
 *
 * When multiple batches qualify, the one with the largest `remainingBalance`
 * wins — that minimises the chance of falling back into an auto-purchase
 * before the next upload.
 *
 * Returns `null` when nothing usable exists. Callers can then auto-purchase.
 */
export const findUsableBatch = async ({
  provider,
  account,
  sizeBytes,
  beeURL,
}: {
  provider: Provider.Provider
  account: Address
  sizeBytes: bigint
  beeURL?: string
}): Promise<OwnedBatch | null> => {
  const requiredDepth = getDepthForSize(sizeBytes)
  const batches = await getOwnedBatches({ provider, account })
  const onChainCandidates = batches
    .filter((b) => b.remainingBalance > 0n && b.depth >= requiredDepth)
    // Prefer the batch with the most remaining runway.
    .sort((a, b) => (b.remainingBalance > a.remainingBalance ? 1 : -1))

  if (!beeURL) return onChainCandidates[0] ?? null

  // Verify each candidate against the Bee node before picking one. Some
  // registry entries do not correspond to a finalised on-chain batch and the
  // node will reject uploads against them.
  for (const candidate of onChainCandidates) {
    if (await isBatchUsableOnBee({ beeURL, batchId: candidate.batchId })) {
      return candidate
    }
  }
  return null
}

// ─── Path encoding (SushiSwap V3, exact-output) ──────────────────────────────

const hexToBytes = (h: string): Uint8Array => {
  const stripped = h.startsWith('0x') ? h.slice(2) : h
  const out = new Uint8Array(stripped.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(stripped.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

const bytesToHex = (b: Uint8Array): Hex => {
  let s = '0x'
  for (const byte of b) s += byte.toString(16).padStart(2, '0')
  return s as Hex
}

/**
 * Encode a single-hop exact-output path: `BZZ ++ uint24(fee) ++ tokenIn`.
 *
 * The router's `createBatchNative` requires the path to end in WXDAI (the
 * router wraps native xDAI before swapping).
 */
const encodeSingleHopPath = ({
  fee,
  tokenIn,
}: {
  fee: number
  tokenIn: Address
}): Hex => {
  const out = new Uint8Array(20 + 3 + 20)
  // tokenOut = BZZ (first 20 bytes)
  out.set(hexToBytes(BZZ_TOKEN), 0)
  // fee (3 bytes, big-endian uint24)
  out[20] = (fee >>> 16) & 0xff
  out[21] = (fee >>> 8) & 0xff
  out[22] = fee & 0xff
  // tokenIn (next 20 bytes)
  out.set(hexToBytes(tokenIn), 23)
  return bytesToHex(out)
}

// ─── Receipt log helpers ──────────────────────────────────────────────────────

type RpcLog = {
  address: Address
  data: Hex
  topics: readonly Hex[]
}

const extractBatchIdFromReceipt = (
  logs: readonly RpcLog[],
  topic0: Hex,
  emitter: Address,
): Hex => {
  for (const log of logs) {
    if (
      log.address.toLowerCase() !== emitter.toLowerCase() ||
      log.topics[0]?.toLowerCase() !== topic0.toLowerCase()
    ) {
      continue
    }
    // `batchId` is the first indexed param → topics[1]
    const batchId = log.topics[1]
    if (batchId) return batchId
  }
  throw new Error(
    `Batch creation event not found in receipt (emitter=${emitter}, topic0=${topic0})`,
  )
}

// ─── Public entry points ──────────────────────────────────────────────────────

export type BuyBatchOptions = {
  privateKey: Hex
  sizeBytes?: bigint
  durationSeconds?: bigint
  /**
   * Bee node address. If omitted, defaults to the signer address — fine for
   * Beeport's hosted uploader, which signs its own uploads, but bee operators
   * must pass their node's overlay address explicitly.
   */
  nodeAddress?: Address
  /**
   * Slippage cap as a fraction (e.g. `0.10` = 10 % above `bzzAmountOut`).
   * Applied only on the Beeport path, where we must commit to a `maxAmountIn`
   * up front. Defaults to `0.20` (20 %).
   */
  slippage?: number
  rpcUrl?: string
  verbose?: boolean
}

export type BuyBatchResult = {
  batchId: Hex
  txHash: Hex
  depth: number
  bucketDepth: number
  initialBalancePerChunk: bigint
  totalBzzAmount: bigint
}

/**
 * Purchase an immutable Swarm postage batch via Beeport's SushiSwap router,
 * paying with native xDAI. Returns the resulting batch ID.
 */
export const buyBatchViaBeeport = async (
  opts: BuyBatchOptions,
): Promise<BuyBatchResult> => {
  const provider = Provider.from(fromHttp(opts.rpcUrl ?? GNOSIS.rpc))

  const signer = fromPublicKey(getPublicKey({ privateKey: opts.privateKey }))
  const sizeBytes = opts.sizeBytes ?? DEFAULT_BATCH_SIZE_BYTES
  const durationSeconds = opts.durationSeconds ?? DEFAULT_BATCH_DURATION_SECONDS
  const slippage = opts.slippage ?? 0.2

  const depth = getDepthForSize(sizeBytes)
  const bucketDepth = DEFAULT_BUCKET_DEPTH
  const initialBalancePerChunk = await getAmountForDuration({
    provider,
    durationSeconds,
  })
  // bzzAmountOut = initialBalancePerChunk × 2^depth
  const bzzAmountOut = initialBalancePerChunk * (1n << BigInt(depth))

  // Path = BZZ ++ fee(3000) ++ WXDAI (single 0.3 % hop, exact-output).
  const poolFee = 3000
  const path = encodeSingleHopPath({ fee: poolFee, tokenIn: WXDAI })

  // Quote the exact-output swap via the router (free off-chain estimation).
  const quotedAmountIn = await callUint({
    provider,
    to: BEEPORT_REGISTRY,
    data: encodeData(quoteSingleHopAbi, [WXDAI, poolFee, bzzAmountOut]),
  })

  // Add slippage room on top of the quote.
  const slippageBp = BigInt(Math.round(slippage * 10_000))
  const maxAmountIn = (quotedAmountIn * (10_000n + slippageBp)) / 10_000n

  if (opts.verbose) {
    logger.info(
      `Beeport batch: depth=${depth} bucketDepth=${bucketDepth} initialBalancePerChunk=${initialBalancePerChunk} bzzAmountOut=${bzzAmountOut} quotedAmountIn(wei)=${quotedAmountIn} maxAmountIn(wei)=${maxAmountIn}`,
    )
  }

  // Random 32-byte nonce. The registry derives the batchId from
  // keccak256(abi.encode(STAMPS_REGISTRY, nonce)).
  const nonceHex = bytesToHex(new Uint8Array(randomBytes(32)))

  const data = encodeData(createBatchNativeAbi, [
    path,
    maxAmountIn,
    bzzAmountOut,
    {
      owner: signer,
      nodeAddress: (opts.nodeAddress ?? signer) as Address,
      initialBalancePerChunk,
      depth,
      bucketDepth,
      nonce: nonceHex,
      immutable_: true,
    },
  ])

  logger.start(
    `Buying Swarm batch via Beeport (depth=${depth}, ${durationSeconds}s)`,
  )

  const txHash = (await sendTransaction({
    provider,
    chainId: GNOSIS.id,
    privateKey: opts.privateKey,
    to: BEEPORT_REGISTRY,
    data,
    from: signer,
    value: maxAmountIn,
  })) as Hex

  logger.info(`Submitted: ${GNOSIS.explorer}/tx/${txHash}`)

  const receipt = await waitForTransaction(provider, txHash)

  const batchId = extractBatchIdFromReceipt(
    receipt.logs as unknown as readonly RpcLog[],
    BATCH_CREATED_VIA_SWAP_TOPIC,
    BEEPORT_REGISTRY,
  )

  logger.success(`Batch created: ${batchId}`)

  return {
    batchId,
    txHash,
    depth,
    bucketDepth,
    initialBalancePerChunk,
    totalBzzAmount: bzzAmountOut,
  }
}

/**
 * Purchase an immutable Swarm postage batch via the canonical PostageStamp
 * contract, paying with BZZ ERC-20 the caller already holds. Approves the
 * required BZZ amount first.
 */
export const buyBatchViaBee = async (
  opts: BuyBatchOptions,
): Promise<BuyBatchResult> => {
  const provider = Provider.from(fromHttp(opts.rpcUrl ?? GNOSIS.rpc))

  const signer = fromPublicKey(getPublicKey({ privateKey: opts.privateKey }))
  const sizeBytes = opts.sizeBytes ?? DEFAULT_BATCH_SIZE_BYTES
  const durationSeconds = opts.durationSeconds ?? DEFAULT_BATCH_DURATION_SECONDS

  const depth = getDepthForSize(sizeBytes)
  const bucketDepth = DEFAULT_BUCKET_DEPTH
  const initialBalancePerChunk = await getAmountForDuration({
    provider,
    durationSeconds,
  })
  const totalBzz = initialBalancePerChunk * (1n << BigInt(depth))

  // Sanity check: caller must hold enough BZZ.
  const bzzBalance = await getBzzBalance({ provider, account: signer })
  if (bzzBalance < totalBzz) {
    throw new Error(
      `Insufficient BZZ balance (have ${bzzBalance}, need ${totalBzz})`,
    )
  }

  if (opts.verbose) {
    logger.info(
      `Bee batch: depth=${depth} bucketDepth=${bucketDepth} initialBalancePerChunk=${initialBalancePerChunk} totalBzz=${totalBzz}`,
    )
  }

  const nonceHex = bytesToHex(new Uint8Array(randomBytes(32)))

  // 1. Approve BZZ to the PostageStamp contract.
  logger.start(`Approving ${totalBzz} BZZ to PostageStamp`)
  const approveTx = (await sendTransaction({
    provider,
    chainId: GNOSIS.id,
    privateKey: opts.privateKey,
    to: BZZ_TOKEN,
    data: encodeData(erc20ApproveAbi, [POSTAGE_STAMP, totalBzz]),
    from: signer,
  })) as Hex
  logger.info(`Approve: ${GNOSIS.explorer}/tx/${approveTx}`)
  await waitForTransaction(provider, approveTx)

  // 2. Create the batch.
  logger.start(`Buying Swarm batch via PostageStamp (depth=${depth})`)
  const txHash = (await sendTransaction({
    provider,
    chainId: GNOSIS.id,
    privateKey: opts.privateKey,
    to: POSTAGE_STAMP,
    data: encodeData(createBatchAbi, [
      signer,
      initialBalancePerChunk,
      depth,
      bucketDepth,
      nonceHex,
      true,
    ]),
    from: signer,
  })) as Hex
  logger.info(`Submitted: ${GNOSIS.explorer}/tx/${txHash}`)

  const receipt = await waitForTransaction(provider, txHash)

  const batchId = extractBatchIdFromReceipt(
    receipt.logs as unknown as readonly RpcLog[],
    BATCH_CREATED_TOPIC,
    POSTAGE_STAMP,
  )

  logger.success(`Batch created: ${batchId}`)

  return {
    batchId,
    txHash,
    depth,
    bucketDepth,
    initialBalancePerChunk,
    totalBzzAmount: totalBzz,
  }
}
