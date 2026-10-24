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
  type FilecoinChain,
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
import type { PinStatus, StatusFunction, UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import {
  sendTransaction,
  simulateTransaction,
  waitForTransaction,
} from '../../utils/tx.js'

const providerName = 'Filecoin'

export async function findPiece(
  providerURL: string,
  pieceCid: string,
  options: {
    timeoutMs?: number
    pollInterval?: number
    verbose?: boolean
  } = {},
): Promise<void> {
  // This is an HTTP readiness probe against the SP's PDP server (`/pdp/piece`),
  // NOT an on-chain wait — it polls until the SP has ingested and indexed the
  // just-uploaded piece, before we move on to the on-chain addPieces step.
  // Ingestion latency scales with payload size / SP load, so a small fixed
  // retry count (previously 5 × 3s = ~15s) aborts otherwise-fine deploys.
  //
  // Mirror the upstream Synapse SDK (@filoz/synapse-core RETRY_CONSTANTS):
  // poll every 4s, bounded by a 5-minute wall-clock timeout. Both are
  // overridable via env for slow SPs / large payloads.
  const envTimeout = Number(process.env.OMNIPIN_FILECOIN_FINDPIECE_TIMEOUT_MS)
  const {
    timeoutMs = Number.isFinite(envTimeout) && envTimeout > 0
      ? envTimeout
      : 1000 * 60 * 5,
    pollInterval = 4000,
    verbose = false,
  } = options

  const deadline = Date.now() + timeoutMs
  let attempt = 0
  let lastError: string | undefined

  while (Date.now() < deadline) {
    // A flapping SP drops single connections (connect timeouts, resets).
    // Treat those like "not yet": only the deadline should end the wait.
    try {
      const res = await fetch(
        new URL(`/pdp/piece?pieceCid=${pieceCid}`, providerURL),
      )
      if (verbose) logger.request('GET', res.url, res.status)
      if (res.ok) return
    } catch (e) {
      lastError = (e as Error).cause ? `${e}: ${(e as Error).cause}` : String(e)
      if (verbose) logger.warn(`Polling the SP failed: ${lastError}`)
    }

    attempt++
    if (verbose && attempt % 5 === 0) {
      const elapsed = Math.round((timeoutMs - (deadline - Date.now())) / 1000)
      logger.info(
        `Piece ${pieceCid} not yet stored at provider (${elapsed}s elapsed, ~${Math.round(
          timeoutMs / 1000,
        )}s budget); still waiting…`,
      )
    }

    await setTimeout(pollInterval)
  }

  throw new DeployError(
    providerName,
    `Piece not found on provider after ~${Math.round(
      timeoutMs / 1000,
    )}s. The piece was uploaded but the SP did not confirm it in time; it may still settle. Retry the deploy, or raise OMNIPIN_FILECOIN_FINDPIECE_TIMEOUT_MS.${
      lastError ? ` Last network error: ${lastError}` : ''
    }`,
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

  // Upload the piece to the SP *before* reading costs / depositing. The
  // 5-epoch buffer in `getUploadCosts` only covers drift between the balance
  // read and the on-chain tx that consumes the lockup. With large payloads
  // the upload + SP scheduling alone can exceed 5 epochs, so we hoist the
  // long step ahead of the cost read to keep `addPieces` close to settlement.
  if (verbose) logger.info('Uploading piece to provider')
  await uploadPiece({
    providerURL,
    pieceCid: pieceCid.toString(),
    bytes: carBytes,
  })

  if (verbose) logger.info('Waiting for piece to be stored at provider')
  await findPiece(providerURL, pieceCid.toString(), { verbose })

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

/**
 * Core pin-status check, driven by a client address rather than a private
 * key so it can be exercised against any on-chain client. Exported for
 * tests.
 */
export const filecoinPieceStatus = async ({
  pieceCid,
  address,
  providerAddress,
  providerURL,
  chain,
  verbose = false,
}: {
  pieceCid: string
  address: Address
  providerAddress?: Address
  providerURL?: string
  chain: FilecoinChain
  verbose?: boolean
}): Promise<{ pin: PinStatus }> => {
  if (!providerURL) {
    // Resolve the same SP that uploadToFilecoin would pick, so "pinned"
    // means "pinned where a deploy would go".
    const providerId = await pickProvider({
      chain,
      ...(providerAddress ? { providerAddress } : { address }),
    })
    const metadata = await getProviderMetadata({ chain, providerId })
    providerURL = metadata.serviceURL
  }

  const res = await fetch(
    new URL(`/pdp/piece?pieceCid=${pieceCid}`, providerURL),
  )
  if (verbose) logger.request('GET', res.url, res.status)

  if (res.status === 404) return { pin: 'not pinned' }
  if (!res.ok)
    throw new Error(`Filecoin SP piece lookup failed with status ${res.status}`)

  // The piece exists on the SP, but possibly under someone else's deal —
  // report pinned only when it sits in one of this client's active data
  // sets. Data sets living on other SPs 404 (or 401) here, which the loop
  // skips, and that also keeps the check safe against SPs that enforce JWT
  // auth: an unreadable data set can only downgrade the answer to
  // 'not pinned', never fake a 'pinned'.
  const datasets = await getClientDataSets({ chain, address })

  for (const dataset of datasets.filter((ds) => ds.pdpEndEpoch === 0n)) {
    const dsRes = await fetch(
      new URL(`/pdp/data-sets/${dataset.dataSetId}`, providerURL),
    )
    if (verbose) logger.request('GET', dsRes.url, dsRes.status)
    if (!dsRes.ok) continue

    const { pieces } = (await dsRes.json()) as {
      pieces?: { pieceCid: string; subPieceCid: string }[]
    }
    if (
      pieces?.some((p) => p.pieceCid === pieceCid || p.subPieceCid === pieceCid)
    )
      return { pin: 'pinned' }
  }

  return { pin: 'not pinned' }
}

export const statusOnFilecoin: StatusFunction<{
  bytes?: Uint8Array<ArrayBuffer>
  pieceCid?: string
  providerAddress?: Address
  providerURL?: string
  filecoinChain?: 'mainnet' | 'calibration'
}> = async ({
  auth,
  verbose,
  bytes,
  pieceCid,
  providerAddress,
  providerURL,
  filecoinChain = 'mainnet',
}) => {
  // The PDP API is keyed by piece CID (CommP), which cannot be derived from
  // the IPFS root CID alone — it takes the packed CAR bytes or an explicit
  // FILECOIN_PIECE_CID. Without either the answer is unknowable.
  const piece =
    pieceCid ?? (bytes ? calculatePieceCID(bytes).toString() : undefined)
  if (!piece) return { pin: 'unknown' }

  const privateKey = auth.token as Hex | undefined
  if (!privateKey) throw new MissingKeyError('FILECOIN_TOKEN')

  const address = fromPublicKey(getPublicKey({ privateKey }))
  const chain =
    filecoinChain === 'mainnet' ? filecoinMainnet : filecoinCalibration

  return filecoinPieceStatus({
    pieceCid: piece,
    address,
    providerAddress,
    providerURL,
    chain,
    verbose,
  })
}
