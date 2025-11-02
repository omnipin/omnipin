import * as AbiParameters from 'ox/AbiParameters'
import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { sign } from 'ox/Secp256k1'
import { toHex } from 'ox/Signature'
import { getSignPayload } from 'ox/TypedData'
import { logger } from '../logger.js'
import { FILECOIN_REGISTRY_ADDRESS } from './constants.js'

const abi = ['address', 'string[]', 'string[]', 'bytes'] as const

export const createDataSet = async ({
  providerURL,
  privateKey,
  providerAddress,
  address,
  verbose,
}: {
  providerAddress: Address
  providerURL: string
  privateKey: Hex
  address: Address
  verbose?: boolean
}): Promise<string> => {
  const metadata = [{ key: 'withIPFSIndexing', value: '' }] as const

  const keys = metadata.map((item) => item.key)
  const values = metadata.map((item) => item.value)

  const payload = getSignPayload({
    types: {
      CreateDataSet: [
        { name: 'clientDataSetId', type: 'uint256' },
        { name: 'metadata', type: 'MetadataEntry[]' },
        { name: 'payee', type: 'address' },
      ],
      MetadataEntry: [
        { name: 'key', type: 'string' },
        { name: 'value', type: 'string' },
      ],
    },
    domain: {
      name: 'FilecoinWarmStorageService',
      verifyingContract: FILECOIN_REGISTRY_ADDRESS,
      version: '1',
      chainId: 314159,
    },
    primaryType: 'CreateDataSet',
    message: {
      clientDataSetId: 0n, // Your unique dataset ID (start with 0)
      metadata,
      payee: providerAddress, // Service provider's payment address
    },
  })

  const signature = toHex(sign({ payload, privateKey }))

  const extraData = AbiParameters.encode(AbiParameters.from(abi), [
    address,
    keys,
    values,
    signature,
  ])
  logger.info(`Record keeper address: ${providerAddress}`)
  const res = await fetch(new URL('/pdp/data-sets', providerURL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recordKeeper: providerAddress,
      extraData,
    }),
  })
  if (verbose) logger.request('POST', res.url, res.status)
  const text = await res.text()
  if (!res.ok) throw new Error('Failed to create a dataset', { cause: text })

  return text
}
