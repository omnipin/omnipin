/**
 * E2E fork test: verifies that the `getUploadCosts` deposit math survives
 * realistic epoch drift between balance check and on-chain execution.
 *
 * Spawns a local anvil fork of Filecoin mainnet via `prool`, redirects
 * the foc SDK's HTTP transport to it, impersonates a real payer (who
 * already has USDfc and an active draining rail), and exercises the
 * deposit + drift path. `evm_snapshot`/`evm_revert` isolates each test.
 *
 * Forks from `latest - 20` at startup rather than pinning to an absolute
 * historical block, because the upstream Glif RPC enforces a 336-hour
 * lookback limit. The PAYER has 20+ active draining rails on mainnet, so
 * `lockupRate > 0` holds at any recent block — which is all this test
 * needs to exercise the drift/buffer code path.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import {
  accounts,
  resolveAccountState,
} from '@omnipin/foc/fil-pay'
import { filecoinMainnet, filProvider } from '@omnipin/foc/utils'
import {
  calculateEffectiveRate,
  getServicePricing,
  getUploadCosts,
} from '@omnipin/foc/warm-storage'
import { encodeData } from 'ox/AbiFunction'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { Instance } from 'prool'

const FORK_RPC = 'https://api.node.glif.io/rpc/v1'
const PORT = 8545
const ANVIL_URL = `http://localhost:${PORT}`
// Fork from `latest - FORK_LAG` to ensure the block is within the upstream
// RPC's lookback window (Glif disallows lookbacks > 336h). 20 epochs ≈ 10
// min of safety margin, well within the window.
const FORK_LAG = 20n

// A real Filecoin Mainnet payer with active draining rails and >0 USDfc in
// their wallet — the walletbeat-beta CI worker that experienced the
// original `InsufficientLockupFunds` reverts. As long as this address has
// at least one active rail (`lockupRate > 0`), the drift-coverage tests
// below remain meaningful.
const PAYER = '0xd28283fcb6e484fcccd3d5b0d24c6ed7eb28ce86' as const

const USDFC_APPROVE_ABI = {
  type: 'function',
  inputs: [
    { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  name: 'approve',
  outputs: [{ type: 'bool' }],
  stateMutability: 'nonpayable',
} as const

const FIL_PAY_DEPOSIT_ABI = {
  type: 'function',
  inputs: [
    { name: 'token', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  name: 'deposit',
  outputs: [],
  stateMutability: 'payable',
} as const

let anvil: ReturnType<typeof Instance.anvil>
let originalProvider: Provider.Provider

const rpc = (method: string, params: unknown[] = []) =>
  filProvider[filecoinMainnet.id].request(
    { method, params } as never,
  ) as Promise<string>

const blockNumber = async () => BigInt(await rpc('eth_blockNumber', []))

beforeAll(async () => {
  // Pick a fresh fork block. We do this BEFORE redirecting filProvider so
  // the read goes to the upstream RPC. `latest - FORK_LAG` keeps us inside
  // Glif's 336-hour lookback window while staying stable enough for the
  // fork to come up cleanly.
  const forkBlock = (await blockNumber()) - FORK_LAG

  anvil = Instance.anvil({
    forkUrl: FORK_RPC,
    forkBlockNumber: forkBlock,
    chainId: 314,
    port: PORT,
    autoImpersonate: true,
  })
  await anvil.start()

  // Redirect SDK transport to the local anvil fork. Use a generous
  // timeout because the first few RPCs trigger fork state fetches from
  // upstream glif, which can be slow.
  originalProvider = filProvider[filecoinMainnet.id]
  filProvider[filecoinMainnet.id] = Provider.from(
    fromHttp(ANVIL_URL, { timeout: 60_000 }),
  )

  // Top the impersonated payer up with ample FIL for gas.
  await rpc('anvil_setBalance', [
    PAYER,
    '0x21e19e0c9bab2400000', // 10000 FIL
  ])
}, 60_000)

afterAll(async () => {
  if (originalProvider) {
    filProvider[filecoinMainnet.id] = originalProvider
  }
  await anvil.stop()
})

let snapshotId: string
beforeEach(async () => {
  snapshotId = await rpc('evm_snapshot')
})
afterEach(async () => {
  await rpc('evm_revert', [snapshotId])
})

const sendTx = async (tx: {
  from: string
  to: string
  data: string
  value?: string
}) => {
  const hash = await rpc('eth_sendTransaction', [tx])
  // Poll for receipt — anvil automines but the call may return before
  // the tx is included.
  for (let i = 0; i < 50; i++) {
    const receipt = await filProvider[filecoinMainnet.id].request({
      method: 'eth_getTransactionReceipt',
      params: [hash],
    } as never) as { status: string } | null
    if (receipt) {
      if (BigInt(receipt.status) !== 1n) {
        throw new Error(`tx reverted: ${hash}`)
      }
      return hash
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`tx never mined: ${hash}`)
}

const directDeposit = async (amount: bigint) => {
  // 1. payer.approve(FilecoinPay, amount) on USDFC
  await sendTx({
    from: PAYER,
    to: filecoinMainnet.contracts.usdfc.address,
    data: encodeData(USDFC_APPROVE_ABI, [
      filecoinMainnet.contracts.payments.address,
      amount,
    ]),
  })
  // 2. FilecoinPay.deposit(USDFC, PAYER, amount)
  await sendTx({
    from: PAYER,
    to: filecoinMainnet.contracts.payments.address,
    data: encodeData(FIL_PAY_DEPOSIT_ABI, [
      filecoinMainnet.contracts.usdfc.address,
      PAYER,
      amount,
    ]),
  })
}

describe('getUploadCosts on a forked Filecoin mainnet', () => {
  it(
    'getUploadCosts with default bufferEpochs (5n) survives realistic drift',
    async () => {
      const dataSize = 100n * 1024n * 1024n // 100 MiB

      const costs = await getUploadCosts({
        clientAddress: PAYER,
        dataSize,
        isNewDataSet: true,
        chain: filecoinMainnet,
      })

      // Sanity: payer has an active rail, so buffer should be non-zero.
      const noBuffer = await getUploadCosts({
        clientAddress: PAYER,
        dataSize,
        isNewDataSet: true,
        bufferEpochs: 0n,
        chain: filecoinMainnet,
      })
      expect(costs.depositNeeded > noBuffer.depositNeeded).toBe(true)

      // Deposit the buffered amount. The deposit itself triggers
      // `settleAccountLockupBeforeAndAfter` on FilecoinPay, which advances
      // `lockupLastSettledAt` to the deposit block. After that, the buffer
      // is what protects the next state-changing call (createDataSet).
      if (costs.depositNeeded > 0n) {
        await directDeposit(costs.depositNeeded)
      }

      // Snapshot post-deposit state. From this point we have `bufferEpochs`
      // of drift coverage before createDataSet would revert.
      const acctAfterDeposit = await accounts({
        address: PAYER,
        chain: filecoinMainnet,
      })
      const pricing = await getServicePricing({ chain: filecoinMainnet })
      const rate = calculateEffectiveRate({
        sizeInBytes: dataSize,
        pricePerTiBPerMonth: pricing.pricePerTiBPerMonthNoCDN,
        minimumPricePerMonth: pricing.minimumPricePerMonth,
        epochsPerMonth: pricing.epochsPerMonth,
      })
      const targetLockup =
        rate.ratePerEpoch * (30n * 2880n) + 100_000_000_000_000_000n

      // Mine 3 blocks. This test uses 2 separate txs (approve + deposit)
      // which consumes 2 of the 5 buffer epochs *before* settlement; in
      // production omnipin uses single-tx `depositWithPermitAndApproveOperator`,
      // so the full 5 epochs are available post-deposit. Adjusted accordingly.
      await rpc('anvil_mine', ['0x3'])

      const epochAfter = await blockNumber()
      const projectionAfter = resolveAccountState({
        funds: acctAfterDeposit.funds,
        lockupCurrent: acctAfterDeposit.lockupCurrent,
        lockupRate: acctAfterDeposit.lockupRate,
        lockupLastSettledAt: acctAfterDeposit.lockupLastSettledAt,
        currentEpoch: epochAfter,
      })

      // Available after the buffer window of drift must still cover the
      // rail's lockup requirement (this is what createDataSet checks).
      expect(projectionAfter.availableFunds >= targetLockup).toBe(true)
    },
    120_000,
  )

  it(
    'skip-buffer rule: fresh accounts on new datasets get zero buffer',
    async () => {
      // A fresh address with no rails (lockupRate === 0n).
      const FRESH = '0x000000000000000000000000000000000000aBcD'
      const dataSize = 100n * 1024n * 1024n

      const fresh = await getUploadCosts({
        clientAddress: FRESH,
        dataSize,
        isNewDataSet: true,
        chain: filecoinMainnet,
      })
      const freshNoBuffer = await getUploadCosts({
        clientAddress: FRESH,
        dataSize,
        isNewDataSet: true,
        bufferEpochs: 0n,
        chain: filecoinMainnet,
      })

      // skip-buffer kicks in: depositNeeded matches the no-buffer value.
      expect(fresh.depositNeeded).toBe(freshNoBuffer.depositNeeded)
    },
    60_000,
  )

})
