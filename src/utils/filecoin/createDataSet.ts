import { randomInt } from 'node:crypto'
import { decode } from 'ox/AbiError'
import * as AbiParameters from 'ox/AbiParameters'
import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { sign } from 'ox/Secp256k1'
import { toHex } from 'ox/Signature'
import { getSignPayload } from 'ox/TypedData'
import { logger } from '../logger.js'
import { FWSS_KEEPER_ADDRESS, FWSS_PROXY_ADDRESS } from './constants.js'

const abi = ['address', 'uint256', 'string[]', 'string[]', 'bytes'] as const

const invalidSignatureAbi = {
  type: 'error',
  inputs: [
    { name: 'expected', internalType: 'address', type: 'address' },
    { name: 'actual', internalType: 'address', type: 'address' },
  ],
  name: 'InvalidSignature',
} as const

export const createDataSet = async ({
  providerURL,
  privateKey,
  payee,
  address: payer,
  verbose,
}: {
  payee: Address
  providerURL: string
  privateKey: Hex
  address: Address
  verbose?: boolean
}): Promise<string> => {
  const metadata = [{ key: 'withIPFSIndexing', value: '' }] as const

  const keys = metadata.map((item) => item.key)
  const values = metadata.map((item) => item.value)

  const clientDataSetId = BigInt(randomInt(10 ** 8))

  logger.info(`Client data set ID: ${clientDataSetId}`)

  const payload = getSignPayload({
    types: {
      MetadataEntry: [
        { name: 'key', type: 'string' },
        { name: 'value', type: 'string' },
      ],
      CreateDataSet: [
        { name: 'clientDataSetId', type: 'uint256' },
        { name: 'payee', type: 'address' },
        { name: 'metadata', type: 'MetadataEntry[]' },
      ],
    },
    domain: {
      name: 'FilecoinWarmStorageService',
      verifyingContract: FWSS_KEEPER_ADDRESS,
      version: '1',
      chainId: 314159,
    },
    primaryType: 'CreateDataSet',
    message: {
      clientDataSetId,
      metadata,
      payee,
    },
  })

  const signature = toHex(sign({ payload, privateKey }))

  const extraData = AbiParameters.encode(AbiParameters.from(abi), [
    payer,
    clientDataSetId,
    keys,
    values,
    signature,
  ])
  logger.info(`Record keeper address: ${FWSS_KEEPER_ADDRESS}`)
  const res = await fetch(new URL('/pdp/data-sets', providerURL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recordKeeper: FWSS_KEEPER_ADDRESS,
      extraData,
    }),
  })
  if (verbose) logger.request('POST', res.url, res.status)
  const text = await res.text()
  if (!res.ok) {
    if (text.includes('recordKeeper address not allowed for public service')) {
      throw new Error('The SP does not support registering data sets')
    }
    const vmErrorMatch = text.match(/vm error=\[(0x[a-fA-F0-9]+)\]/)
    if (vmErrorMatch) {
      const errorHex = vmErrorMatch[1] as Hex

      const cause = decode(invalidSignatureAbi, errorHex)

      throw new Error('Signer mismatch', { cause })
    }
    throw new Error('Failed to create a dataset', { cause: text })
  }

  return text
}
