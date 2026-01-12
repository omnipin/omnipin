import type { Address } from 'ox/Address'
import { type Hex, toBigInt } from 'ox/Hex'
import type { Provider } from 'ox/Provider'
import * as Secp256k1 from 'ox/Secp256k1'
import { fromRpc } from 'ox/TransactionReceipt'
import * as TxEnvelopeEip1559 from 'ox/TxEnvelopeEip1559'
import { setTimeout } from '../deps.js'
import { logger } from './logger.js'

// Gas ceiling for RPC simulations (30M) - needed for Helios compatibility
export const SIMULATION_GAS_LIMIT = 30_000_000n

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
          gas: SIMULATION_GAS_LIMIT,
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
        gas: SIMULATION_GAS_LIMIT,
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
  const feeHistory = await provider.request({
    method: 'eth_feeHistory',
    params: ['0x5', 'latest', [10, 50, 90]],
  })

  const estimatedGas = await estimateGas({ provider, from, to, data })

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
    await setTimeout(delay)
  }

  throw new Error(`Transaction ${hash} not mined within timeout period`)
}
