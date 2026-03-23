import {
  createDataSetPayload,
  createUploadPiecesPayload,
  getClientDataSets,
} from '@omnipin/foc/data-set'
import { getServicePrice, getUSDfcBalance } from '@omnipin/foc/fil-pay'
import {
  createDataSetAndAddPiece,
  uploadPiece,
  uploadPieceToDataSet,
} from '@omnipin/foc/pdp-api'
import {
  getProviderMetadata,
  getProviderPayee,
  pickProvider,
} from '@omnipin/foc/sp-registry'
import {
  calculatePieceCID,
  filecoinCalibration,
  filecoinMainnet,
  filProvider,
} from '@omnipin/foc/utils'
import { type Address, fromPublicKey } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { getPublicKey } from 'ox/Secp256k1'
import * as Value from 'ox/Value'
import { randomInt, setTimeout } from '../../deps.js'
import { DeployError, MissingKeyError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { waitForTransaction } from '../../utils/tx.js'

const providerName = 'Filecoin'

async function findPiece(
  providerURL: string,
  pieceCid: string,
  options: { retries?: number; pollInterval?: number; verbose?: boolean } = {},
): Promise<void> {
  const { retries = 5, pollInterval = 3000, verbose = false } = options

  for (let i = 0; i < retries; i++) {
    const res = await fetch(
      new URL(`/pdp/piece?pieceCid=${pieceCid}`, providerURL),
    )
    if (verbose) logger.request('GET', res.url, res.status)

    if (res.ok) {
      return
    }
    await setTimeout(pollInterval)
  }

  throw new DeployError(
    providerName,
    'Piece not found on provider after retries',
  )
}

export const uploadToFilecoin: UploadFunction<{
  providerAddress?: Address
  providerURL?: string
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

  logger.info(`Filecoin chain: ${chain.name}`)

  const balance = await getUSDfcBalance({ address, chain })
  logger.info(`USDfc balance: ${Value.format(balance, 18)}`)

  if (balance === 0n) throw new DeployError(providerName, 'No USDfc on account')

  if (verbose) logger.info('Looking up existing data sets')

  const providerId = await pickProvider({
    chain,
    ...(providerAddress ? { providerAddress } : { address }),
  })

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
  const pieceCid = calculatePieceCID(carBytes)

  const datasets = await getClientDataSets({
    chain,
    address,
  })

  const providerActiveDataSets = datasets.filter(
    (ds) => ds.providerId === providerId && ds.pdpEndEpoch === 0n,
  )

  if (providerActiveDataSets.length === 0 || filecoinForceNewDataset) {
    logger.info('Creating new data set')

    if (verbose) logger.info('Uploading piece to provider')
    await uploadPiece({
      providerURL,
      pieceCid: pieceCid.toString(),
      bytes: carBytes,
    })

    logger.info('Waiting for piece to be stored at provider')
    await findPiece(providerURL, pieceCid.toString(), { verbose })

    const payload = createDataSetPayload({
      chain,
      payee,
      payer: address,
      privateKey,
    })

    const { hash } = await createDataSetAndAddPiece({
      pieceCid: pieceCid.toString(),
      subPieceCids: [pieceCid.toString()],
      chain,
      providerURL,
      payload,
    })

    if (verbose) logger.info(`Transaction hash: ${hash}`)

    const provider = filProvider[chain.id]
    await waitForTransaction(provider, hash)
  } else {
    logger.info('Using existing data set')

    const dataset = providerActiveDataSets[0]

    if (verbose) logger.info(`Data set ID: ${dataset.dataSetId}`)

    if (verbose) logger.info('Uploading piece to provider')
    await uploadPiece({
      providerURL,
      pieceCid: pieceCid.toString(),
      bytes: carBytes,
    })

    logger.info('Waiting for piece to be stored at provider')
    await findPiece(providerURL, pieceCid.toString(), { verbose })

    const nonce = BigInt(randomInt(10 ** 8))
    const extraData = await createUploadPiecesPayload({
      pieceCid,
      datasetId: dataset.dataSetId,
      privateKey,
      nonce,
      clientDataSetId: dataset.clientDataSetId,
      chain,
    })

    const { hash } = await uploadPieceToDataSet({
      datasetId: Number(dataset.dataSetId),
      pieceCid,
      extraData,
      providerURL,
    })

    if (verbose) logger.info(`Transaction hash: ${hash}`)

    const provider = filProvider[chain.id]
    await waitForTransaction(provider, hash)
  }
  logger.success('Piece registered on chain')

  logger.info('Verifying piece is accessible on PDP API')
  await findPiece(providerURL, pieceCid.toString(), { verbose })
  logger.success('Piece found')

  return { cid }
}
