/* eslint-disable @stylistic/max-len */

import { encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import type { Provider } from 'ox/Provider'
import { sign } from 'ox/Secp256k1'
import type { Signature } from 'ox/Signature'
import { getSignPayload } from 'ox/TypedData'
import type { ChainName } from '../types.js'
import { getTransactionHash } from './safe/constants.js'
import { type EIP3770Address, getEip3770Address } from './safe/eip3770.js'
import type { SafeTransactionData } from './safe/types.js'

export const chainToSafeApiUrl = (chainName: ChainName) =>
  `https://safe-transaction-${chainName}.safe.global`

const zeroAddress = '0x0000000000000000000000000000000000000000'

export const prepareSafeTransactionData = async ({
  txData,
  safeAddress,
  provider,
  chainId,
}: {
  txData: SafeTransactionData
  safeAddress: EIP3770Address | Address
  provider: Provider
  chainId: number
}): Promise<{ safeTxHash: Hex }> => {
  const { address: safeAddressWithoutPrefix } = getEip3770Address({
    fullAddress: safeAddress,
    chainId,
  })
  const { address: to } = getEip3770Address({ fullAddress: txData.to, chainId })

  const safeTxHash = await provider.request({
    method: 'eth_call',
    params: [
      {
        to: safeAddressWithoutPrefix,
        data: encodeData(getTransactionHash, [
          to,
          0n,
          txData.data,
          txData.operation,
          txData.safeTxGas ?? 0n,
          txData.baseGas ?? 0n,
          txData.gasPrice ?? 0n,
          zeroAddress,
          zeroAddress,
          txData.nonce,
        ]),
      },
      'latest',
    ],
  })

  return { safeTxHash }
}

export const generateSafeTransactionSignature = async ({
  txData,
  safeAddress,
  chainId,
  privateKey,
}: {
  txData: SafeTransactionData
  safeAddress: Address
  chainId: number
  privateKey: Hex
}): Promise<Signature> => {
  const payload = getSignPayload({
    types: {
      EIP712Domain: [
        {
          type: 'uint256',
          name: 'chainId',
        },
        {
          type: 'address',
          name: 'verifyingContract',
        },
      ],
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'SafeTx',
    domain: {
      chainId: BigInt(chainId),
      verifyingContract: safeAddress,
    },
    message: {
      to: txData.to,
      value: 0n,
      data: txData.data ?? '0x',
      operation: txData.operation,
      safeTxGas: txData.safeTxGas ?? 0n,
      baseGas: txData.baseGas ?? 0n,
      gasPrice: txData.gasPrice ?? 0n,
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: txData.nonce ?? 0n,
    },
  })

  return sign({ payload, privateKey })
}
