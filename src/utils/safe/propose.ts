import { type Address, checksum } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import type { ChainName } from '../../types.js'
import { chainToSafeApiUrl } from '../safe.js'
import type { SafeTransactionData } from './types.js'

export const proposeTransaction = async ({
  txData,
  safeAddress,
  chainName,
  address,
  safeTxHash,
  senderSignature,
}: {
  txData: SafeTransactionData
  safeAddress: Address
  chainName: ChainName
  address: Address
  safeTxHash: Hex
  senderSignature: Hex
  chainId: number
}): Promise<void> => {
  const res = await fetch(
    `${chainToSafeApiUrl(chainName)}/api/v1/safes/${safeAddress}/multisig-transactions/`,
    {
      method: 'POST',
      body: JSON.stringify(
        {
          ...txData,
          contractTransactionHash: safeTxHash,
          sender: checksum(address),
          signature: senderSignature,
          origin: 'Omnipin',
          value: 0n,
          baseGas: txData.baseGas ?? 0n,
          gasPrice: txData.gasPrice ?? 0n,
          safeTxGas: txData.safeTxGas ?? 0n,
        },
        (_, v) => (typeof v === 'bigint' ? v.toString() : v),
      ),
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
  // The Safe Transaction Service normally answers with JSON, but proxy/error
  // pages (502s, redirects, rate limits) come back as HTML. Read the body as
  // text first so a non-JSON response surfaces a useful error instead of a
  // cryptic `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
  const text = await res.text()

  if (!res.ok) {
    let json: { message?: string; detail?: string } | undefined
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(
        `Safe Transaction Service returned ${res.status} ${res.statusText} (non-JSON response)`,
        { cause: text },
      )
    }
    throw new Error(json?.message ?? json?.detail ?? text, { cause: json })
  }

  console.log(text)
}
