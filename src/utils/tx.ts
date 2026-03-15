import type { Address } from 'ox/Address'
import { fromNumber, type Hex, toBigInt } from 'ox/Hex'
import type { Provider } from 'ox/Provider'
import * as Secp256k1 from 'ox/Secp256k1'
import { fromRpc } from 'ox/TransactionReceipt'
import * as TxEnvelopeEip1559 from 'ox/TxEnvelopeEip1559'
import { setTimeout } from '../deps.js'
import { logger } from './logger.js'

// Helios enforces the EIP-7825 tx gas cap (2^24 = 16,777,216) for eth_call validation.
export const SIMULATION_GAS_LIMIT = fromNumber(16_777_216)

export const estimateGas = async ({
  provider,
  to,
  data,
  from,
  value = '0x0',
}: {
  provider: Provider
  to: Address
  data: Hex
  from: Address
  value?: Hex
}): Promise<bigint> => {
  return toBigInt(
    await provider.request({
      method: 'eth_estimateGas',
      params: [
        {
          from,
          to,
          data,
          value,
          gas: fromNumber(SIMULATION_GAS_LIMIT),
        },
        'latest',
      ],
    }),
  )
}

export const simulateTransaction = async ({
  provider,
  to,
  data,
  from,
}: {
  provider: Provider
  to: Address
  data: Hex
  from: Address
}): Promise<unknown> => {
  return provider.request({
    method: 'eth_call',
    params: [
      {
        to,
        data,
        from,
        gas: fromNumber(SIMULATION_GAS_LIMIT),
      },
      'latest',
    ],
  })
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
  const estimatedGas = await estimateGas({ provider, from, to, data })

  logger.info(`Estimated gas: ${estimatedGas}`)

  const nonce = toBigInt(
    await provider.request({
      method: 'eth_getTransactionCount',
      params: [from, 'latest'],
    }),
  )

  // Get current base fee from latest block
  const block = await provider.request({
    method: 'eth_getBlockByNumber',
    params: ['latest', false],
  })

  if (!block) throw new Error('Failed to fetch latest block')

  const baseFeePerGas = toBigInt(block.baseFeePerGas || '0x0')

  // Get suggested priority fee from RPC
  const maxPriorityFeePerGas = toBigInt(
    await provider.request({
      method: 'eth_maxPriorityFeePerGas',
    }),
  )

  // Set max fee as 2x base fee + priority fee (standard practice)
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas

  const envelope = TxEnvelopeEip1559.from({
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
    payload: TxEnvelopeEip1559.getSignPayload(envelope),
    privateKey,
  })

  const serialized = TxEnvelopeEip1559.serialize(envelope, {
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
    try {
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
    } catch (error) {
      const err = error as { code?: number; message?: string }
      if (err.code === -32603 || err.message?.includes('receipt not found')) {
        // Receipt not found yet, continue to retry
      } else {
        throw error
      }
    }

    // exponential backoff (1s → 2s → 4s → ... → max 30s)
    const delay = Math.min(1000 * 2 ** attempt, 30000)
    await setTimeout(delay)
  }

  throw new Error(`Transaction ${hash} not mined within timeout period`)
}
