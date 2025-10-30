import { type Address, checksum } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import type { ChainName } from '../../types.js'
import { chainToSafeApiUrl } from '../safe.js'
import { type EIP3770Address, getEip3770Address } from './eip3770.js'
import type { SafeTransactionData } from './types.js'

export const proposeTransaction = async ({
  txData,
  safeAddress,
  chainName,
  address,
  safeTxHash,
  senderSignature,
  chainId,
}: {
  txData: SafeTransactionData
  safeAddress: Address | EIP3770Address
  chainName: ChainName
  address: Address
  safeTxHash: Hex
  senderSignature: Hex
  chainId: number
}): Promise<void> => {
  // In order to serialize BigInt
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    get() {
      return () => String(this)
    },
  })

  const { address: safe } = getEip3770Address({
    fullAddress: safeAddress,
    chainId,
  })

  const res = await fetch(
    `${chainToSafeApiUrl(chainName)}/api/v1/safes/${safe}/multisig-transactions/`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...txData,
        contractTransactionHash: safeTxHash,
        sender: checksum(address),
        signature: senderSignature,
        origin: 'Omnipin',
        value: 0n,
        baseGas: txData.baseGas ?? 0n,
        gasPrice: txData.gasPrice ?? 0n,
        safeTxGas: txData.safeTxGas ?? 0n,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
  if (!res.ok) {
    const json = await res.json()
    throw new Error(json.message, { cause: json })
  }

  const text = await res.text()
  console.log(text)
}
