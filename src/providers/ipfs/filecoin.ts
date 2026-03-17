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
import { getRail } from '../../utils/filecoin/getRail.js'
import { getRandomProviderId } from '../../utils/filecoin/getRandomProviderId.js'
import { getUSDfcBalance } from '../../utils/filecoin/getUSDfcBalance.js'
import { getServicePrice } from '../../utils/filecoin/pay/getServicePrice.js'
import { uploadPieceToDataSet } from '../../utils/filecoin/uploadPieceToDataSet.js'
import { waitForDatasetReady } from '../../utils/filecoin/waitForDataSetCreation.js'
import { logger } from '../../utils/logger.js'
import { waitForTransaction } from '../../utils/tx.js'

const providerName = 'Filecoin'

export const uploadToFilecoin: UploadFunction<{
  providerAddress?: Address
  providerURL?: string
  pieceCid: string
  filecoinChain: 'mainnet' | 'calibration'
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
  size,
}) => {
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

  if (dataSets.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: if there is more than one data set it must be defined
    const lastProvider = dataSets.at(-1)!
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

  const validateProviderURL = async (
    url: string,
    id: bigint,
    attempt = 0,
  ): Promise<{ url: string; id: bigint }> => {
    try {
      await fetch(url, { method: 'HEAD' })
      return { url, id }
    } catch (_e) {
      if (attempt >= 5) throw new Error(`No reachable SP found`)
      logger.warn(`SP URL ${url} not reachable, trying another provider...`)
      const newProviderId = await getRandomProviderId({ chain })
      const { serviceURL, address } = await getProviderMetadata({
        chain,
        providerId: newProviderId,
      })
      providerAddress = address
      return validateProviderURL(serviceURL, newProviderId, attempt + 1)
    }
  }

  const validated = await validateProviderURL(providerURL, providerId)
  providerURL = validated.url
  providerId = validated.id

  const payee = await getProviderPayee({ id: providerId, chain })

  if (verbose) logger.info(`Filecoin SP Payee: ${payee}`)

  const { perMonth } = await getServicePrice({ size, chain })

  logger.info(`Price for storage: ${Value.format(perMonth, 18)} USDfc/month`)

  let datasetId: bigint
  let clientDataSetId: bigint | undefined
  const providerDataSets = dataSets.filter(
    (set) => set.providerId === providerId,
  )

  const findActiveDataset = async () => {
    for (const ds of providerDataSets) {
      try {
        const rail = await getRail({ railId: ds.pdpRailId, chain })
        if (rail.endEpoch === 0n) {
          return ds
        }
        logger.info(
          `Dataset ${ds.dataSetId} is terminated (endEpoch: ${rail.endEpoch}), checking next...`,
        )
      } catch {
        // If we can't fetch rail info, we can't verify if it's active or not
        // Don't return it - just continue to the next dataset
        logger.warn(
          `Could not fetch rail info for dataset ${ds.dataSetId}, skipping`,
        )
      }
    }
    return null
  }

  const activeDataset = await findActiveDataset()

  if (!activeDataset) {
    if (verbose) logger.info('No active dataset found. Creating new.')
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
      perMonth,
    })

    datasetId = clientId
    clientDataSetId = clientId
    logger.info(`Pending data set creation: ${statusUrl}`)
    logger.info(`Pending transaction: ${chain.blockExplorer}/tx/${hash}`)
    await waitForTransaction(filProvider[chainId], hash)

    await waitForDatasetReady(statusUrl)

    logger.success('Data set registered')

    const newDataSets = await getClientDataSets({ address, chain })
    const newDataset = newDataSets.find((ds) => ds.clientDataSetId === clientId)
    if (!newDataset) {
      throw new DeployError(
        providerName,
        'Failed to find newly created dataset',
      )
    }
    datasetId = newDataset.dataSetId
    clientDataSetId = clientId

    logger.info(`SP Dataset ID: ${datasetId}`)
    logger.info('Waiting for 5 seconds to ensure everything is in sync')
    await setTimeout(5000)
  } else {
    logger.info(`Using active dataset: ${activeDataset.dataSetId}`)
    datasetId = activeDataset.dataSetId
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
    await setTimeout(1000)
  }
  logger.success('Piece found')

  const tryUploadPiece = async (): Promise<{
    hash: Hex
    statusUrl: string
  }> => {
    try {
      return await uploadPieceToDataSet({
        pieceCid: calculatedCid,
        providerURL,
        verbose,
        datasetId,
        privateKey,
        nonce: BigInt(randomInt(10 ** 8)),
        clientDataSetId,
        chain,
      })
    } catch (e) {
      const error = e as Error
      const cause = error.cause as string | undefined

      if (
        cause?.includes('0x211a40c0') ||
        error.message.includes('DataSetPaymentAlreadyTerminated')
      ) {
        logger.warn('Dataset payment terminated. Creating new dataset...')
        const {
          clientDataSetId: newClientId,
          hash,
          statusUrl,
        } = await createDataSet({
          privateKey,
          payee,
          providerURL,
          address,
          chain,
          perMonth,
        })

        logger.info(`Pending data set creation: ${statusUrl}`)
        logger.info(`Pending transaction: ${chain.blockExplorer}/tx/${hash}`)
        await waitForTransaction(filProvider[chainId], hash)

        await waitForDatasetReady(statusUrl)

        logger.success('New data set registered')

        const newDataSets = await getClientDataSets({ address, chain })
        const newDataset = newDataSets.find(
          (ds) => ds.clientDataSetId === newClientId,
        )
        if (!newDataset) {
          throw new DeployError(
            providerName,
            'Failed to find newly created dataset',
          )
        }
        const newDatasetId = newDataset.dataSetId
        logger.info(`SP Dataset ID: ${newDatasetId}`)
        logger.info('Waiting for 5 seconds to ensure everything is in sync')
        await setTimeout(5000)

        return uploadPieceToDataSet({
          pieceCid: calculatedCid,
          providerURL,
          verbose,
          datasetId: newDatasetId, // SP's dataset ID
          privateKey,
          nonce: BigInt(randomInt(10 ** 8)),
          clientDataSetId: newClientId, // Client's dataset ID
          chain,
        })
      }

      throw e
    }
  }

  const { hash, statusUrl } = await tryUploadPiece()
  logger.info(`Pending piece upload: ${statusUrl}`)
  logger.info(`Pending transaction: ${chain.blockExplorer}/tx/${hash}`)
  await waitForTransaction(filProvider[chainId], hash)

  return { cid }
}
