import { randomInt } from 'node:crypto'
import { type Address, fromPublicKey } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { getPublicKey } from 'ox/Secp256k1'
import { format } from 'ox/Value'
import { DeployError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { calculatePieceCID } from '../../utils/filecoin/calculatePieceCID.js'
import {
  filecoinCalibration,
  filecoinMainnet,
  filProvider,
} from '../../utils/filecoin/constants.js'
import { createDataSet } from '../../utils/filecoin/createDataSet.js'
import { getClientDataSets } from '../../utils/filecoin/getClientDatasets.js'
import { getProviderIdByAddress } from '../../utils/filecoin/getProviderIdByAddress.js'
import { getProviderPayee } from '../../utils/filecoin/getProviderPayee.js'
import { getUSDfcBalance } from '../../utils/filecoin/getUSDfcBalance.js'
import { uploadPieceToDataSet } from '../../utils/filecoin/uploadPieceToDataSet.js'
import { logger } from '../../utils/logger.js'
import { waitForTransaction } from '../../utils/tx.js'

const providerName = 'Filecoin'

export const uploadToFilecoin: UploadFunction<{
  providerAddress: Address
  providerURL: string
  payerPrivateKey: Hex
  pieceCid: string
  filecoinChain: 'mainnet' | 'calibration'
}> = async ({
  providerAddress,
  providerURL,
  cid,
  car,
  payerPrivateKey: privateKey,
  verbose,
  pieceCid,
  filecoinChain = 'mainnet',
}) => {
  const publicKey = getPublicKey({ privateKey })
  const address = fromPublicKey(publicKey)

  logger.info(`Payer address: ${address}`)

  const chain =
    filecoinChain === 'mainnet' ? filecoinMainnet : filecoinCalibration
  const chainId = chain.id

  logger.info(`Filecoin chain: ${chain.name}`)

  const balance = await getUSDfcBalance({ address, chain })
  logger.info(`USDfc balance: ${format(balance, 18)}`)

  if (balance === 0n) throw new DeployError(providerName, 'No USDfc on account')

  logger.info(`Filecoin SP address: ${providerAddress}`)
  logger.info(`Filecoin SP URL: ${providerURL}`)

  const providerId = await getProviderIdByAddress({
    providerAddress,
    chain,
  })

  logger.info(`Filecoin SP ID: ${providerId}`)

  const payee = await getProviderPayee({ id: providerId, chain })

  logger.info(`Filecoin SP Payee: ${payee}`)

  logger.info('Looking up existing datasets')
  const dataSets = await getClientDataSets({ address, chain })

  let datasetId: bigint
  let clientDataSetId: bigint | undefined
  const providerDataSets = dataSets.filter(
    (set) => set.providerId === providerId,
  )
  if (providerDataSets.length === 0) {
    logger.info('No dataset found. Creating.')
    const {
      clientDataSetId: clientId,
      hash,
      statusUrl,
    } = await createDataSet({
      privateKey,
      payee,
      providerURL,
      address,
      chain,
    })

    datasetId = clientId
    clientDataSetId = clientId
    logger.info(`Pending data set creation: ${statusUrl}`)
    logger.info(
      `Pending transaction: https://filecoin-testnet.blockscout.com/tx/${hash}`,
    )
    await waitForTransaction(filProvider[chainId], hash)
  } else {
    logger.info(`Using existing dataset: ${providerDataSets[0].dataSetId}`)
    datasetId = providerDataSets[0].dataSetId
  }

  // Buffer CAR bytes once and derive Piece CID
  const carBytes = new Uint8Array(await car.arrayBuffer())
  const calculatedCid = calculatePieceCID(carBytes)
  const expectedPieceCid = calculatedCid.toString()

  // Validate provided pieceCid (if any) and resolve final value
  if (pieceCid && pieceCid !== expectedPieceCid)
    throw new DeployError(
      providerName,
      'Provided pieceCid does not match CAR content',
    )
  const resolvedPieceCid = pieceCid || expectedPieceCid

  if (!pieceCid) {
    logger.info(`Piece CID: ${resolvedPieceCid}`)

    let res = await fetch(new URL('/pdp/piece', providerURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pieceCid: resolvedPieceCid,
      }),
    })

    if (verbose) logger.request('POST', res.url, res.status)

    const text = await res.text()

    if (!res.ok) {
      throw new DeployError(providerName, text)
    }

    if (res.status === 201) {
      const location = res.headers.get('Location')
      if (!location)
        throw new DeployError(
          providerName,
          'Missing "Location" Header in response',
        )
      const uploadUuid = location.match(/\/piece\/upload\/([a-fA-F0-9-]+)/)?.[1]

      logger.info(`Upload UUID: ${uploadUuid}`)

      res = await fetch(
        new URL(`/pdp/piece/upload/${uploadUuid}`, providerURL),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': carBytes.length.toString(),
          },
          body: carBytes,
        },
      )

      if (verbose) logger.request('PUT', res.url, res.status)

      if (res.status !== 204) {
        throw new DeployError(providerName, await res.text())
      }

      logger.success('Uploaded piece to the SP')
    }
  } else {
    logger.info(`Piece CID: ${resolvedPieceCid}`)
  }

  logger.info('Attempting to retrieve the piece from PDP API')
  for (let i = 0; i < 30; i++) {
    const res = await fetch(
      new URL(`/pdp/piece?pieceCid=${resolvedPieceCid}`, providerURL),
    )
    if (verbose) logger.request('GET', res.url, res.status)

    if (res.ok) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  logger.success('Piece found')

  const { hash, statusUrl } = await uploadPieceToDataSet({
    pieceCid: calculatedCid,
    providerURL,
    verbose,
    datasetId,
    privateKey,
    nonce: BigInt(randomInt(10 ** 8)),
    clientDataSetId,
    chain,
  })
  logger.info(`Pending piece upload: ${statusUrl}`)
  logger.info(
    `Pending transaction: https://filecoin-testnet.blockscout.com/tx/${hash}`,
  )
  await waitForTransaction(filProvider[chainId], hash)

  return { cid }
}
