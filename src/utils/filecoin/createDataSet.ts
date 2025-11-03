import { randomInt } from 'node:crypto'
import * as AbiParameters from 'ox/AbiParameters'
import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { sign } from 'ox/Secp256k1'
import { toHex } from 'ox/Signature'
import { getSignPayload } from 'ox/TypedData'
import { logger } from '../logger.js'
import { FWSS_KEEPER_ADDRESS, FWSS_PROXY_ADDRESS } from './constants.js'

const abi = ['address', 'uint256', 'string[]', 'string[]', 'bytes'] as const

export const createDataSet = async ({
  providerURL,
  privateKey,
  payee,
  address,
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
      CreateDataSet: [
        { name: 'clientDataSetId', type: 'uint256' },
        { name: 'payee', type: 'address' }, // ADD THIS
        { name: 'metadataKeys', type: 'string[]' },
        { name: 'metadataValues', type: 'string[]' },
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
      payee: payee,
      metadataKeys: keys,
      metadataValues: values,
    },
  })

  const signature = toHex(sign({ payload, privateKey }))

  const extraData = AbiParameters.encode(AbiParameters.from(abi), [
    address,
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
    throw new Error('Failed to create a dataset', { cause: text })
  }

  return text
}
