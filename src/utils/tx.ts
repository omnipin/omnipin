import { type AbiFunction, decodeResult } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { type Hex, toBigInt } from 'ox/Hex'
import type { Provider } from 'ox/Provider'
import * as Secp256k1 from 'ox/Secp256k1'
import * as TransactionEnvelopeEip1559 from 'ox/TransactionEnvelopeEip1559'
import { fromRpc } from 'ox/TransactionReceipt'
import { logger } from './logger.js'

export const simulateTransaction = async <Abi extends AbiFunction>({
  provider,
  to,
  data,
  abi,
  from,
}: {
  provider: Provider
  to: Address
  data: Hex
  abi: Abi
  from: Address
}): Promise<boolean> => {
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        to,
        data,
        from,
      },
      'latest',
    ],
  })

  return decodeResult(abi, result) as boolean
}

export const sendTransaction = async ({
  provider,
  chainId,
  privateKey,
  to,
  data,
  from,
}: {
  provider: Provider
  chainId: number
  privateKey: Hex
  to: Address
  data: Hex
  from: Address
}) => {
  const feeHistory = await provider.request({
    method: 'eth_feeHistory',
    params: ['0x5', 'latest', [10, 50, 90]],
  })

  const estimatedGas = toBigInt(
    await provider.request({
      method: 'eth_estimateGas',
      params: [
        {
          from,
          to,
          data,
          value: '0x0',
        },
      ],
    }),
  )

  logger.info(`Estimated gas: ${estimatedGas}`)

  const nonce = toBigInt(
    await provider.request({
      method: 'eth_getTransactionCount',
      params: [from, 'latest'],
    }),
  )

  // Extract base fee and priority fee from feeHistory as needed
  const baseFeePerGas = BigInt(feeHistory.baseFeePerGas.slice(-1)[0])
  if (!feeHistory.reward) throw new Error('No reward in feeHistory')
  const priorityFeePerGas = BigInt(feeHistory.reward.slice(-1)[0][1]) // 50th percentile
  const maxPriorityFeePerGas = priorityFeePerGas
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas

  const envelope = TransactionEnvelopeEip1559.from({
    from,
    chainId,
    maxFeePerGas,
    maxPriorityFeePerGas,
    to,
    data,
    value: 0n,
    gas: estimatedGas,
    nonce,
  })

  const signature = Secp256k1.sign({
    payload: TransactionEnvelopeEip1559.getSignPayload(envelope),
    privateKey,
  })

  const serialized = TransactionEnvelopeEip1559.serialize(envelope, {
    signature,
  })

  return await provider.request({
    method: 'eth_sendRawTransaction',
    params: [serialized],
  })
}

export const waitForTransaction = async (provider: Provider, hash: Hex) => {
  const maxAttempts = 10

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rawReceipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [hash],
    })

    if (rawReceipt) {
      if (rawReceipt.status === '0x0')
        throw new Error(`Transaction ${hash} reverted`)

      const chainId = await provider.request({ method: 'eth_chainId' })
      return fromRpc({ ...rawReceipt, chainId })
    }

    // exponential backoff (1s → 2s → 4s → ... → max 30s)
    const delay = Math.min(1000 * 2 ** attempt, 30000)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  throw new Error(`Transaction ${hash} not mined within timeout period`)
}
