import {
  depositWithPermitAndApproveOperatorWriteParameters,
  depositWithPermitWriteParameters,
  getUSDfcBalance,
  isFwssMaxApproved,
} from '@omnipin/foc/fil-pay'
import { filecoinMainnet, filProvider } from '@omnipin/foc/utils'
import { type Address, fromPublicKey } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { getPublicKey } from 'ox/Secp256k1'
import * as Value from 'ox/Value'
import { setTimeout } from '../deps.js'
import { FILECOIN_MAINNET } from './filecoin-bridge.js'
import { logger } from './logger.js'
import { sendTransaction, waitForTransaction } from './tx.js'

export type FilecoinDepositResult = {
  /** Filecoin tx hash of the depositWithPermit / …AndApproveOperator call. */
  depositTxHash: Hex
  /** Amount actually deposited, in USDfc atomic units (18 decimals). */
  depositedAmount: bigint
}

/**
 * Deposit existing USDfc on Filecoin into Filecoin Pay (the storage payment
 * contract). Used both as the second leg of a full bridge+deposit top-up and
 * as a standalone command for users who already hold USDfc on Filecoin.
 *
 * @param amount Whole USDfc to deposit (e.g. `'5'` ⇒ 5 USDfc). 18 decimals.
 * @param waitForBalance When true, poll Filecoin until the wallet's USDfc
 *   balance reaches `amount`. Set by the bridge flow because Squid's relayer
 *   reports `success` slightly before the destination RPC exposes the new
 *   balance. Default: `false` (assume the balance is already there).
 */
export const depositFilecoinUsdfc = async ({
  privateKey,
  amount,
  from,
  waitForBalance = false,
  verbose,
}: {
  privateKey: Hex
  amount: string
  /** Wallet address holding the USDfc. Defaults to the signer's address. */
  from?: Address
  waitForBalance?: boolean
  verbose?: boolean
}): Promise<FilecoinDepositResult> => {
  const signer = fromPublicKey(getPublicKey({ privateKey }))
  const owner = (from ?? signer) as Address

  let amountAtomic: bigint
  try {
    amountAtomic = Value.from(amount, 18)
  } catch {
    throw new Error(`Invalid amount: ${amount}`)
  }
  if (amountAtomic <= 0n) {
    throw new Error(`Amount must be positive: ${amount}`)
  }

  if (waitForBalance) {
    logger.info('Waiting for USDfc balance to arrive on Filecoin…')
    await waitForUsdfcBalance({
      address: owner,
      minimumAtomic: amountAtomic,
      verbose,
    })
  } else {
    // Single check up front so we can surface a friendly error instead of
    // letting `depositWithPermit` revert on insufficient balance.
    const balance = await getUSDfcBalance({
      address: owner,
      chain: filecoinMainnet,
    })
    if (balance < amountAtomic) {
      throw new Error(
        `Insufficient USDfc on Filecoin for ${owner}: have ${Value.format(
          balance,
          18,
        )}, need ${Value.format(amountAtomic, 18)}`,
      )
    }
  }

  logger.info(
    `Depositing ${Value.format(amountAtomic, 18)} USDfc to Filecoin Pay`,
  )

  const alreadyApproved = await isFwssMaxApproved({
    clientAddress: owner,
    chain: filecoinMainnet,
  })

  const params = alreadyApproved
    ? await depositWithPermitWriteParameters({
        privateKey,
        address: owner,
        amount: amountAtomic,
        chain: filecoinMainnet,
      })
    : await depositWithPermitAndApproveOperatorWriteParameters({
        privateKey,
        address: owner,
        amount: amountAtomic,
        chain: filecoinMainnet,
      })

  const depositHash = (await sendTransaction({
    ...params,
    chainId: filecoinMainnet.id,
    privateKey,
  })) as Hex

  logger.info(`Deposit tx: ${FILECOIN_MAINNET.explorer}/tx/${depositHash}`)

  await waitForTransaction(filProvider[filecoinMainnet.id], depositHash)
  logger.success('Deposit confirmed')

  return { depositTxHash: depositHash, depositedAmount: amountAtomic }
}

/**
 * Poll Filecoin RPC until the address's USDfc balance reaches at least
 * `minimumAtomic`. Used by the bridge → deposit handoff because Squid's
 * relayer reports `success` as soon as the destination tx is mined, but some
 * RPC providers lag by a few seconds before exposing the new balance.
 */
const waitForUsdfcBalance = async ({
  address,
  minimumAtomic,
  maxAttempts = 60,
  intervalMs = 10_000,
  verbose,
}: {
  address: Address
  minimumAtomic: bigint
  maxAttempts?: number
  intervalMs?: number
  verbose?: boolean
}): Promise<bigint> => {
  for (let i = 0; i < maxAttempts; i++) {
    const balance = await getUSDfcBalance({
      address,
      chain: filecoinMainnet,
    })
    if (balance >= minimumAtomic) return balance
    if (verbose && i % 5 === 0) {
      logger.info(
        `Waiting for USDfc balance (have ${Value.format(balance, 18)}, need ${Value.format(minimumAtomic, 18)})`,
      )
    }
    await setTimeout(intervalMs)
  }
  throw new Error(
    `USDfc balance did not reach ${Value.format(minimumAtomic, 18)} within ${maxAttempts} polls`,
  )
}
