/**
 * E2E fork test: verifies that the new `getUploadCosts` deposit math
 * survives realistic epoch drift between balance check and on-chain
 * execution — the bug that caused the original
 * `InsufficientLockupFunds(0xdae03403…)` revert.
 *
 * Spawns a local anvil fork of Filecoin mainnet via `prool`, redirects
 * the foc SDK's HTTP transport to it, impersonates a real payer (who
 * already has USDfc and an existing draining rail), and exercises the
 * deposit + drift path. `evm_snapshot`/`evm_revert` isolates each test.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import {
  accounts,
  resolveAccountState,
} from '@omnipin/foc/fil-pay'
import { filecoinMainnet, filProvider } from '@omnipin/foc/utils'
import {
  calculateDepositNeeded,
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

// A real Filecoin Mainnet payer with an active draining rail and >65 USDfc
// in their wallet — same address that experienced the original revert.
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
  anvil = Instance.anvil({
    forkUrl: FORK_RPC,
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
    'reproduces the InsufficientLockupFunds drift when bufferEpochs=0n',
    async () => {
      const dataSize = 100n * 1024n * 1024n // 100 MiB

      // Snapshot the account + pricing using foc's RPC modules.
      const acct = await accounts({ address: PAYER, chain: filecoinMainnet })
      const pricing = await getServicePricing({ chain: filecoinMainnet })
      const currentEpoch = await blockNumber()

      const projection = resolveAccountState({
        funds: acct.funds,
        lockupCurrent: acct.lockupCurrent,
        lockupRate: acct.lockupRate,
        lockupLastSettledAt: acct.lockupLastSettledAt,
        currentEpoch,
      })

      // The minimum lockup the FWSS contract will require for a new dataset
      // (rateLockup over the lockup period + sybil fee). We approximate via
      // the same path getUploadCosts uses, with bufferEpochs=0n.
      const depositNeeded = calculateDepositNeeded({
        dataSize,
        currentDataSetSize: 0n,
        pricePerTiBPerMonth: pricing.pricePerTiBPerMonthNoCDN,
        minimumPricePerMonth: pricing.minimumPricePerMonth,
        epochsPerMonth: pricing.epochsPerMonth,
        isNewDataSet: true,
        currentLockupRate: acct.lockupRate,
        debt: 0n,
        availableFunds: projection.availableFunds,
        fundedUntilEpoch: projection.fundedUntilEpoch,
        currentEpoch,
        bufferEpochs: 0n,
      })

      // The contract's "creation requirement" for the new rail is at least
      // rateLockup+sybilFee. Recompute using the effective rate to reason
      // about it locally.
      const rate = calculateEffectiveRate({
        sizeInBytes: dataSize,
        pricePerTiBPerMonth: pricing.pricePerTiBPerMonthNoCDN,
        minimumPricePerMonth: pricing.minimumPricePerMonth,
        epochsPerMonth: pricing.epochsPerMonth,
      })
      // Target lockup that must be cleared for createDataSet to succeed:
      const targetLockup =
        rate.ratePerEpoch * (30n * 2880n) + 100_000_000_000_000_000n // sybil fee

      // Deposit *exactly* what the zero-buffer math computes — replicating
      // the original failing-run sizing.
      if (depositNeeded > 0n) {
        await directDeposit(depositNeeded)
      }

      // Drift forward 30 epochs (~15 min), well within a normal upload + tx
      // mining gap.
      await rpc('anvil_mine', ['0x1e'])

      // Re-read state and project. With bufferEpochs=0n the projected
      // available funds should drift below the requirement.
      const acct2 = await accounts({ address: PAYER, chain: filecoinMainnet })
      const epoch2 = await blockNumber()
      const projection2 = resolveAccountState({
        funds: acct2.funds,
        lockupCurrent: acct2.lockupCurrent,
        lockupRate: acct2.lockupRate,
        lockupLastSettledAt: acct2.lockupLastSettledAt,
        currentEpoch: epoch2,
      })

      // The bug: post-drift, available < target requirement.
      expect(projection2.availableFunds < targetLockup).toBe(true)
    },
    120_000,
  )

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
