import { type Address, fromPublicKey } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { getPublicKey } from 'ox/Secp256k1'
import * as Value from 'ox/Value'
import { randomInt, setTimeout } from '../../deps.js'
import { DeployError, MissingKeyError } from '../../errors.js'
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
import { getProviderMetadata } from '../../utils/filecoin/getProviderMetadata.js'
import { getProviderPayee } from '../../utils/filecoin/getProviderPayee.js'
import { getRandomProviderId } from '../../utils/filecoin/getRandomProviderId.js'
import { getUSDfcBalance } from '../../utils/filecoin/getUSDfcBalance.js'
import { getServicePrice } from '../../utils/filecoin/pay/getServicePrice.js'
import { uploadPieceToDataSet } from '../../utils/filecoin/uploadPieceToDataSet.js'
import { logger } from '../../utils/logger.js'
import { waitForTransaction } from '../../utils/tx.js'

const providerName = 'Filecoin'

export const uploadToFilecoin: UploadFunction<{
  providerAddress?: Address
  providerURL?: string
  pieceCid: string
  filecoinChain: 'mainnet' | 'calibration'
  filecoinForceNewDataset?: boolean
  token: Hex
}> = async ({
  providerAddress,
  providerURL,
  cid,
  car,
  token: privateKey,
  verbose,
  pieceCid,
  filecoinChain = 'mainnet',
  filecoinForceNewDataset,
  size,
}) => {
  if (!providerURL && providerAddress)
    throw new MissingKeyError('FILECOIN_SP_URL')
  if (!providerAddress && providerURL)
    throw new MissingKeyError('FILECOIN_SP_ADDRESS')

  const publicKey = getPublicKey({ privateKey })
  const address = fromPublicKey(publicKey)

  logger.info(`Payer address: ${address}`)

  const chain =
    filecoinChain === 'mainnet' ? filecoinMainnet : filecoinCalibration
  const chainId = chain.id

  logger.info(`Filecoin chain: ${chain.name}`)

  const balance = await getUSDfcBalance({ address, chain })
  logger.info(`USDfc balance: ${Value.format(balance, 18)}`)

  if (balance === 0n) throw new DeployError(providerName, 'No USDfc on account')

  if (verbose) logger.info('Looking up existing data sets')
  const dataSets = await getClientDataSets({ address, chain })

  let providerId: bigint

  // Only consider active datasets (not terminated) when picking provider
  const activeDataSets = dataSets.filter((ds) => ds.pdpEndEpoch === 0n)

  if (activeDataSets.length > 0 && !filecoinForceNewDataset) {
    // biome-ignore lint/style/noNonNullAssertion: if there is more than one data set it must be defined
    const lastProvider = activeDataSets.at(-1)!
    providerId = lastProvider.providerId
  } else if (providerAddress) {
    providerId = await getProviderIdByAddress({
      providerAddress,
      chain,
    })
  } else {
    providerId = await getRandomProviderId({ chain })
  }

  if (verbose) logger.info(`Filecoin SP ID: ${providerId}`)

  if (!providerURL) {
    const { serviceURL, address } = await getProviderMetadata({
      chain,
      providerId,
    })
    providerURL = serviceURL
    providerAddress = address
  }

  const payee = await getProviderPayee({ id: providerId, chain })

  if (verbose) logger.info(`Filecoin SP Payee: ${payee}`)

  const { perMonth } = await getServicePrice({ size, chain })

  logger.info(`Price for storage: ${Value.format(perMonth, 18)} USDfc/month`)

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

  // Upload piece bytes to SP
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

      let uploadSuccess = false
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
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
        } catch (err) {
          if (attempt < 5) {
            logger.warn(
              `Upload failed (attempt ${attempt}/5): ${(err as Error).message}. Retrying...`,
            )
            await setTimeout(attempt * 2000)
            continue
          }
          throw err
        }

        if (verbose) logger.request('PUT', res.url, res.status)

        if (res.status === 204) {
          uploadSuccess = true
          break
        }

        if (attempt < 5) {
          const text = await res.text()
          logger.warn(
            `Upload failed with ${res.status} (attempt ${attempt}/5): ${text.slice(0, 200)}. Retrying...`,
          )
          await setTimeout(attempt * 2000)
          continue
        }

        throw new DeployError(providerName, await res.text())
      }

      if (!uploadSuccess) {
        throw new DeployError(providerName, 'Upload failed after 5 attempts')
      }

      logger.success('Uploaded piece to the SP')
    }
  } else {
    logger.info(`Piece CID: ${resolvedPieceCid}`)
  }

  // Verify piece is available via PDP API
  logger.info('Attempting to retrieve the piece from PDP API')
  let pieceVerified = false
  for (let i = 0; i < 30; i++) {
    const res = await fetch(
      new URL(`/pdp/piece?pieceCid=${resolvedPieceCid}`, providerURL),
    )
    if (verbose) logger.request('GET', res.url, res.status)

    if (res.ok) {
      pieceVerified = true
      break
    }
    await setTimeout(5000)
  }
  if (!pieceVerified) {
    throw new DeployError(providerName, 'Piece not found after 30s')
  }
  logger.success('Piece found')

  // Add piece to a dataset
  // Filter to datasets for this SP, excluding terminated ones (pdpEndEpoch > 0)
  const providerDataSets = dataSets.filter(
    (set) => set.providerId === providerId && set.pdpEndEpoch === 0n,
  )

  if (providerDataSets.length === 0 || filecoinForceNewDataset) {
    // Create dataset and add piece atomically (avoids race condition)
    if (verbose || filecoinForceNewDataset) logger.info('Creating new dataset.')
    const { datasetId, hash } = await createDataSet({
      pieceCid: resolvedPieceCid,
      subPieceCids: [resolvedPieceCid],
      privateKey,
      payee,
      providerURL,
      address,
      chain,
      perMonth,
    })

    logger.success(`Data set registered: ${datasetId}`)
    logger.info(`Transaction: ${chain.blockExplorer}/tx/${hash}`)
    logger.info('Waiting for 5 seconds to ensure everything is in sync')
    await setTimeout(5000)
  } else {
    // Add piece to existing dataset
    const datasetId = providerDataSets[0].dataSetId
    logger.info(`Using existing dataset: ${datasetId}`)

    const { hash, statusUrl } = await uploadPieceToDataSet({
      pieceCid: calculatedCid,
      providerURL,
      verbose,
      datasetId,
      privateKey,
      nonce: BigInt(randomInt(10 ** 8)),
      chain,
    })
    logger.info(`Pending piece upload: ${statusUrl}`)
    logger.info(`Pending transaction: ${chain.blockExplorer}/tx/${hash}`)
    await waitForTransaction(filProvider[chainId], hash)
  }

  return { cid }
}
