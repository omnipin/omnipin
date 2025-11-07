import { randomInt } from 'node:crypto'
import { decode } from 'ox/AbiError'
import * as AbiParameters from 'ox/AbiParameters'
import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { sign } from 'ox/Secp256k1'
import { toHex } from 'ox/Signature'
import { getSignPayload } from 'ox/TypedData'
import * as Value from 'ox/Value'
import { DeployError } from '../../errors.js'
import { logger } from '../logger.js'
import { waitForTransaction } from '../tx.js'
import { type FilecoinChain, filProvider } from './constants.js'
import { depositAndApproveOperator } from './pay/depositAndApproveOperator.js'
import { getAccountInfo } from './pay/getAccountInfo.js'

const abi = ['address', 'uint256', 'string[]', 'string[]', 'bytes'] as const

const metadata = [{ key: 'withIPFSIndexing', value: '' }] as const

const keys = metadata.map((item) => item.key)
const values = metadata.map((item) => item.value)

/**
 * Create a data set on an SP, and deposit to Filecoin Pay if balanace is 0
 * @returns client data set id
 */
export const createDataSet = async ({
  providerURL,
  privateKey,
  payee,
  address: payer,
  verbose,
  chain,
  perMonth,
}: {
  payee: Address
  providerURL: string
  privateKey: Hex
  address: Address
  chain: FilecoinChain
  verbose?: boolean
  perMonth: bigint
}) => {
  const provider = filProvider[chain.id]
  const [funds] = await getAccountInfo({ address: payer, chain })

  if (funds < perMonth) {
    logger.warn('Not enough USDfc deposited to Filecoin Pay')
    logger.info(
      `Depositing ${Value.format(perMonth - funds, 18)} USDfc to Filecoin Pay`,
    )

    const hash = await depositAndApproveOperator({
      privateKey,
      amount: perMonth - funds, // to cover future costs
      address: payer,
      chain,
    })

    logger.info(`Transaction pending: ${chain.blockExplorer}/tx/${hash}`)

    await waitForTransaction(provider, hash)

    logger.success('Transaction succeeded')
  }

  const clientDataSetId = BigInt(randomInt(10 ** 8))

  logger.info(`Client data set ID: ${clientDataSetId}`)

  const recordKeeper = chain.contracts.storage.address

  logger.info(`Record keeper address: ${recordKeeper}`)

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
      verifyingContract: recordKeeper,
      version: '1',
      chainId: chain.id,
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
  const res = await fetch(new URL('/pdp/data-sets', providerURL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({
      recordKeeper,
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

      if (errorHex.includes('0x42d750dc')) {
        const cause = decode(
          {
            type: 'error',
            inputs: [
              {
                name: 'expected',
                internalType: 'address',
                type: 'address',
              },
              { name: 'actual', internalType: 'address', type: 'address' },
            ],
            name: 'InvalidSignature',
          } as const,
          errorHex,
        )

        throw new Error('Signer mismatch', { cause })
      }
      if (errorHex.includes('0x57b1cc25')) {
        throw new Error('Insufficient funds')
      }
      throw new Error('SP execution reverted during dataset creation', {
        cause: text,
      })
    }
    throw new Error('Failed to create a dataset', { cause: text })
  }

  const location = res.headers.get('Location')
  const hash = location?.split('/').pop()
  if (!location || !hash || !hash.startsWith('0x')) {
    throw new DeployError('Filecoin', 'Failed to locate transaction hash')
  }

  return {
    clientDataSetId,
    hash: hash as Hex,
    statusUrl: new URL(location, providerURL).toString(),
  }
}
