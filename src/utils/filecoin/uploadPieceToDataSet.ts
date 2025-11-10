import type { PieceLink } from '@web3-storage/data-segment'
import { toHex } from 'multiformats/bytes'
import { decode } from 'ox/AbiError'
import * as AbiParameters from 'ox/AbiParameters'
import type { Hex } from 'ox/Hex'
import { sign } from 'ox/Secp256k1'
import * as Signature from 'ox/Signature'
import { getSignPayload } from 'ox/TypedData'
import { DeployError } from '../../errors.js'
import { logger } from '../logger.js'
import type { FilecoinChain } from './constants.js'
import { getDataSet } from './getDataSet.js'

const metadata = [{ key: 'withIPFSIndexing', value: '' }] as const
const abi = [
  { type: 'uint256' },
  { type: 'string[][]' },
  { type: 'string[][]' },
  { type: 'bytes' },
] as const

export const uploadPieceToDataSet = async ({
  pieceCid,
  datasetId,
  providerURL,
  verbose,
  privateKey,
  nonce,
  clientDataSetId,
  chain,
}: {
  pieceCid: PieceLink
  providerURL: string
  datasetId: bigint
  verbose?: boolean
  privateKey: Hex
  nonce: bigint
  clientDataSetId?: bigint
  chain: FilecoinChain
}) => {
  const pieces = [pieceCid]
  const pieceData = [{ data: `0x${toHex(pieceCid.bytes)}` }] as const

  if (!pieceData[0].data.startsWith('0x015591'))
    throw new DeployError('Filecoin', 'Invalid piece CID in hex')

  if (!clientDataSetId) {
    const dataSet = await getDataSet({ dataSetId: datasetId, chain })
    clientDataSetId = dataSet.clientDataSetId
  }

  if (verbose) logger.info(`Client data set ID: ${clientDataSetId}`)

  const payload = getSignPayload({
    types: {
      AddPieces: [
        { name: 'clientDataSetId', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'pieceData', type: 'Cid[]' },
        { name: 'pieceMetadata', type: 'PieceMetadata[]' },
      ],
      Cid: [{ name: 'data', type: 'bytes' }],
      PieceMetadata: [
        { name: 'pieceIndex', type: 'uint256' },
        { name: 'metadata', type: 'MetadataEntry[]' },
      ],
      MetadataEntry: [
        { name: 'key', type: 'string' },
        { name: 'value', type: 'string' },
      ],
    },
    domain: {
      name: 'FilecoinWarmStorageService',
      verifyingContract: chain.contracts.storage.address,
      version: '1',
      chainId: chain.id,
    },
    primaryType: 'AddPieces',
    message: {
      clientDataSetId,
      nonce,
      pieceData,
      pieceMetadata: pieces.map((_, index) => ({
        pieceIndex: BigInt(index),
        metadata,
      })),
    },
  })

  const signature = Signature.toHex(sign({ payload, privateKey }))

  const keys = [metadata.map((m) => m.key)]
  const values = [metadata.map((m) => m.value)]

  const extraData = AbiParameters.encode(AbiParameters.from(abi), [
    nonce,
    keys,
    values,
    signature,
  ])

  const res = await fetch(
    new URL(`/pdp/data-sets/${datasetId}/pieces`, providerURL),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pieces: [pieceCid].map((piece) => ({
          pieceCid: piece.toString(),
          subPieces: [{ subPieceCid: piece.toString() }],
        })),
        extraData,
      }),
    },
  )

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
    throw new Error('Failed to upload to a data set', { cause: text })
  }

  const location = res.headers.get('Location')
  const hash = location?.split('/').pop()
  if (!location || !hash || !hash.startsWith('0x')) {
    throw new DeployError('Filecoin', 'Failed to locate transaction hash')
  }

  return {
    hash: hash as Hex,
    statusUrl: new URL(location, providerURL).toString(),
  }
}
