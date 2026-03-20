import type { PieceLink } from '@web3-storage/data-segment'
import { toHex } from 'multiformats/bytes'
import { decode } from 'ox/AbiError'
import * as AbiParameters from 'ox/AbiParameters'
import type { Hex } from 'ox/Hex'
import { sign } from 'ox/Secp256k1'
import * as Signature from 'ox/Signature'
import { getSignPayload } from 'ox/TypedData'
import { setTimeout } from '../../deps.js'
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

  const requestUrl = new URL(`/pdp/data-sets/${datasetId}/pieces`, providerURL)
  const requestBody = JSON.stringify({
    pieces: [pieceCid].map((piece) => ({
      pieceCid: piece.toString(),
      subPieces: [{ subPieceCid: piece.toString() }],
    })),
    extraData,
  })

  // Retry transient 400 errors — the SP may not have indexed the piece in
  // pdp_piecerefs yet (PDPNotifyTask runs async every ~1s).  After the piece
  // is moved from pdp_piece_uploads to pdp_piecerefs the request will succeed.
  // Also retry network errors (connection reset from server crash).
  const maxAttempts = 20
  let lastText = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response
    try {
      res = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
    } catch (err) {
      if (attempt < maxAttempts) {
        logger.warn(
          `Add-piece network error, retrying in ${attempt}s (attempt ${attempt}/${maxAttempts}): ${(err as Error).message}`,
        )
        await setTimeout(attempt * 1000)
        continue
      }
      throw err
    }

    if (verbose) logger.request('POST', res.url, res.status)
    const text = await res.text()

    if (res.ok) {
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

    lastText = text

    // Permanent contract errors — fail immediately
    if (text.includes('DataSetPaymentAlreadyTerminated')) {
      throw new Error(
        `Dataset ${datasetId} payment has expired. Create a new dataset.`,
      )
    }

    // Transient: piece not yet indexed in pdp_piecerefs (PDPNotifyTask runs async ~1s)
    if (res.status === 400 && attempt < maxAttempts) {
      logger.warn(
        `Add-piece returned ${res.status}, retrying in ${attempt}s (attempt ${attempt}/${maxAttempts})${text ? `: ${text.slice(0, 200)}` : ''}`,
      )
      await setTimeout(attempt * 1000)
      continue
    }

    // Non-retriable or final attempt — fall through to error parsing below
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
      throw new Error(`SP execution reverted: ${text.slice(0, 300)}`)
    }
    throw new Error(`Failed to upload to a data set: ${text.slice(0, 300)}`)
  }

  throw new Error(`Failed to upload to a data set: ${lastText.slice(0, 300)}`)
}
