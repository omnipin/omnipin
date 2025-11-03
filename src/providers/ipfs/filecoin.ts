import { type Address, fromPublicKey } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { getPublicKey } from 'ox/Secp256k1'
import { format } from 'ox/Value'
import { DeployError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { calculatePieceCID } from '../../utils/filecoin/calculatePieceCID.js'
import { createDataSet } from '../../utils/filecoin/createDataSet.js'
import { getClientDataSets } from '../../utils/filecoin/getClientDatasets.js'
import { getProviderIdByAddress } from '../../utils/filecoin/getProviderIdByAddress.js'
import { getProviderPayee } from '../../utils/filecoin/getProviderPayee.js'
import { getUSDfcBalance } from '../../utils/filecoin/getUSDfcBalance.js'
import { logger } from '../../utils/logger.js'

const providerName = 'Filecoin'

export const uploadToFilecoin: UploadFunction<{
  providerAddress: Address
  providerURL: string
  payerPrivateKey: Hex
}> = async ({
  providerAddress,
  providerURL,
  cid,
  car,
  payerPrivateKey: privateKey,
  verbose,
}) => {
  const pieceCid = calculatePieceCID(await car.bytes()).toString()

  const publicKey = getPublicKey({ privateKey })
  const address = fromPublicKey(publicKey)

  const balance = await getUSDfcBalance(address)
  logger.info(`USDfc balance: ${format(balance, 18)}`)

  if (balance === 0n) throw new DeployError(providerName, 'Empty USDfc balance')

  logger.info(`Filecoin SP address: ${providerAddress}`)
  logger.info(`Filecoin SP URL: ${providerURL}`)

  const providerId = await getProviderIdByAddress(providerAddress)

  logger.info(`Filecoin SP ID: ${providerId}`)

  const payee = await getProviderPayee(providerId)

  logger.info(`Filecoin SP Payee: ${payee}`)

  let res = await fetch(new URL('/pdp/piece', providerURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pieceCid,
    }),
  })

  if (verbose) logger.request('POST', res.url, res.status)

  let text = await res.text()

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

    res = await fetch(new URL(`/pdp/piece/upload/${uploadUuid}`, providerURL), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': (await car.bytes()).length.toString(),
      },
      body: await car.bytes(),
    })

    if (verbose) logger.request('POST', res.url, res.status)

    if (res.status !== 204) {
      throw new DeployError(providerName, await res.text())
    }

    logger.success('Uploaded piece to the SP')
  }

  logger.info('Attempting to retrieve the piece from PDP API')
  for (let i = 0; i < 30; i++) {
    const res = await fetch(
      new URL(`/pdp/piece?pieceCid=${pieceCid}`, providerURL),
    )
    if (verbose) logger.request('POST', res.url, res.status)

    if (res.ok) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  logger.success('Piece found')

  logger.info('Looking up existing datasets')
  const dataSets = await getClientDataSets(address)

  let datasetId: string
  if (dataSets.length === 0) {
    logger.info('No dataset found. Creating.')
    const res = await createDataSet({
      privateKey,
      payee,
      providerURL,
      address,
    })

    console.log(res)
    datasetId = res.datasetId
  } else {
    logger.info(`Using existing dataset: ${dataSets[0]}`)
    datasetId = String(dataSets[0])
  }

  res = await fetch(new URL(`/pdp/dataset/${datasetId}/piece`, providerURL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pieceCid }),
  })

  if (verbose) logger.request('POST', res.url, res.status)
  text = await res.text()
  if (!res.ok) {
    throw new DeployError(providerName, text)
  }

  console.log({ text })

  return { cid }
}
