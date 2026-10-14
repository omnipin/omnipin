import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
export const OperationType = {
  Call: 0,
  DelegateCall: 1,
} as const
export type OperationType = (typeof OperationType)[keyof typeof OperationType]

export type SafeTransactionData = {
  to: Address
  value: bigint
  data: Hex
  operation: OperationType
  nonce: bigint
  safeTxGas?: bigint
  baseGas?: bigint
  gasPrice?: bigint
  gasToken?: Address
  refundReceiver?: Address
}
