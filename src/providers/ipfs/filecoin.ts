import {
  createDataSetPayload,
  createUploadPiecesPayload,
  getClientDataSets,
} from '@omnipin/foc/data-set'
import {
  depositWithPermitAndApproveOperatorWriteParameters,
  depositWithPermitWriteParameters,
  getUSDfcBalance,
} from '@omnipin/foc/fil-pay'
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
import { getUploadCosts } from '@omnipin/foc/warm-storage'
import { AbiParameters } from 'ox'
import { type Address, fromPublicKey } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { getPublicKey } from 'ox/Secp256k1'
import * as Value from 'ox/Value'
import { randomInt, setTimeout } from '../../deps.js'
import { DeployError, MissingKeyError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import {
  sendTransaction,
  simulateTransaction,
  waitForTransaction,
} from '../../utils/tx.js'

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
  bytes,
  token: privateKey,
  verbose,
  filecoinChain = 'mainnet',
  filecoinForceNewDataset,
  size,
}) => {
  if (!providerAddress && providerURL)
    throw new MissingKeyError('FILECOIN_SP_ADDRESS')

  const publicKey = getPublicKey({ privateKey })
  const address = fromPublicKey(publicKey)

  const chain =
    filecoinChain === 'mainnet' ? filecoinMainnet : filecoinCalibration

  const balance = await getUSDfcBalance({ address, chain })

  if (verbose) {
    logger.info(`Payer address: ${address}`)
    logger.info(`Filecoin chain: ${chain.name}`)

    logger.info(`Wallet USDfc balance: ${Value.format(balance, 18)}`)
    logger.info('Looking up existing data sets')
  }

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

  // Buffer CAR bytes once and derive Piece CID
  const carBytes = bytes
  const pieceCid = calculatePieceCID(carBytes)

  const datasets = await getClientDataSets({
    chain,
    address,
  })

  const providerActiveDataSets = datasets.filter(
    (ds) => ds.providerId === providerId && ds.pdpEndEpoch === 0n,
  )

  const isNewDataSet =
    providerActiveDataSets.length === 0 || filecoinForceNewDataset

  // Single source of truth for cost / deposit / approval. Mirrors
  // synapse-core's getUploadCosts: includes lockup, runway, debt, and a
  // forward-looking buffer for epoch drift between this read and tx
  // execution. Skips the buffer for first-ever uploads on fresh accounts.
  const costs = await getUploadCosts({
    clientAddress: address,
    dataSize: BigInt(size),
    isNewDataSet,
    chain,
  })

  logger.info(
    `Price for storage: ${Value.format(costs.rate.perMonth, 18)} USDfc/month`,
  )

  if (verbose) {
    logger.info(
      `Storage price: ${Value.format(costs.rate.perMonth, 18)} USDFC/month`,
    )
    logger.info(
      `Required deposit: ${Value.format(costs.depositNeeded, 18)} USDFC`,
    )
    logger.info(
      `FWSS max-approved: ${costs.needsFwssMaxApproval ? 'no' : 'yes'}`,
    )
  }

  if (costs.depositNeeded > 0n) {
    if (verbose) {
      logger.info(`Depositing ${Value.format(costs.depositNeeded, 18)} USDFC`)
    }

    const params = costs.needsFwssMaxApproval
      ? await depositWithPermitAndApproveOperatorWriteParameters({
          privateKey,
          address,
          amount: costs.depositNeeded,
          chain,
        })
      : await depositWithPermitWriteParameters({
          privateKey,
          address,
          amount: costs.depositNeeded,
          chain,
        })

    await simulateTransaction(params)

    const hash = await sendTransaction({
      ...params,
      chainId: chain.id,
      privateKey,
    })

    if (verbose) logger.info(`Deposit transaction: ${hash}`)

    await waitForTransaction(filProvider[chain.id], hash)
    logger.success('Deposit confirmed')
  } else if (costs.needsFwssMaxApproval) {
    // No deposit needed, but operator still needs max approval. Future
    // enhancement: split-out a `setOperatorApproval` call. For now this
    // path is unreachable in practice (deposit > 0 on first upload) and
    // logged so we notice if it occurs.
    logger.info('Operator approval needed but no deposit; skipping (no-op).')
  } else {
    logger.info('Sufficient funds available, no deposit needed')
  }

  const nonce = BigInt(randomInt(10 ** 8))
  if (isNewDataSet) {
    logger.info('Creating new data set')

    if (verbose) logger.info('Uploading piece to provider')
    await uploadPiece({
      providerURL,
      pieceCid: pieceCid.toString(),
      bytes: carBytes,
    })

    if (verbose) logger.info('Waiting for piece to be stored at provider')
    await findPiece(providerURL, pieceCid.toString(), { verbose })

    const clientDataSetId = BigInt(randomInt(10 ** 8))

    const createPayload = createDataSetPayload({
      chain,
      payee,
      payer: address,
      privateKey,
      clientDataSetId,
    })

    const addPayload = await createUploadPiecesPayload({
      pieceCid,
      clientDataSetId,
      privateKey,
      nonce,
      chain,
    })

    const payload = AbiParameters.encode(
      [{ type: 'bytes' }, { type: 'bytes' }],
      [createPayload, addPayload],
    )

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

    const extraData = await createUploadPiecesPayload({
      pieceCid,
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
