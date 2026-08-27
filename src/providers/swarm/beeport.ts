import type { Address } from 'ox/Address'
import { fromPublicKey } from 'ox/Address'
import { fromString } from 'ox/Bytes'
import type { Hex } from 'ox/Hex'
import { getSignPayload } from 'ox/PersonalMessage'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import { getPublicKey, sign } from 'ox/Secp256k1'
import * as Signature from 'ox/Signature'
import {
  DeployError,
  MissingKeyError,
  PinningNotSupportedError,
} from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { referenceToCIDString } from '../../utils/swarm.js'
import { findUsableBatch, GNOSIS } from '../../utils/swarm-batch.js'

const providerName = 'Beeport'

const DEFAULT_BEEPORT_URL = 'https://beeport.ethswarm.org'

/**
 * In-memory cache of `signerAddress → batchId`. Skips the on-chain registry
 * + Bee-node lookup on subsequent uploads within the same process.
 */
const batchCache = new Map<string, Hex>()

/**
 * EIP-191 personal_sign over a UTF-8 string. Beeport's backend verifies
 * uploads with `viem.verifyMessage`, which uses the standard
 * `\x19Ethereum Signed Message:\n<len>` prefix.
 */
const personalSign = ({
  message,
  privateKey,
}: {
  message: string
  privateKey: Hex
}): Hex => {
  const payload = getSignPayload(fromString(message))
  return Signature.toHex(sign({ privateKey, payload }))
}

const resolveBatchId = async ({
  signer,
  sizeBytes,
  beeportURL,
  verbose,
}: {
  signer: Address
  sizeBytes: bigint
  beeportURL: string
  verbose?: boolean
}): Promise<Hex> => {
  // 1. Caller-provided override via env var.
  const envBatchId = process.env.OMNIPIN_BEEPORT_BATCH_ID
  if (envBatchId) {
    return (envBatchId.startsWith('0x') ? envBatchId : `0x${envBatchId}`) as Hex
  }

  // 2. In-memory cache from a previous upload in the same process.
  const cached = batchCache.get(signer)
  if (cached) return cached

  // 3. Reuse an already-purchased on-chain batch (registered via Beeport),
  // confirmed usable by the Bee node we are about to upload through.
  const rpcUrl = process.env.OMNIPIN_GNOSIS_RPC_URL ?? GNOSIS.rpc
  const provider = Provider.from(fromHttp(rpcUrl))
  const existing = await findUsableBatch({
    provider,
    account: signer,
    sizeBytes,
    beeURL: beeportURL,
  })
  if (existing) {
    if (verbose) {
      logger.info(
        `Reusing existing Beeport batch ${existing.batchId} (depth=${existing.depth}, remainingBalance=${existing.remainingBalance})`,
      )
    }
    batchCache.set(signer, existing.batchId)
    return existing.batchId
  }

  // Auto-purchase is intentionally not supported here: a freshly created
  // postage batch is not usable on the Bee node for several minutes (the
  // node's stamps indexer lags chain), which would make `omnipin deploy`
  // fail with "batch with id not found" on the very first upload. Users
  // must buy a batch ahead of time with `omnipin batch --provider=Beeport`
  // and either pass it via `OMNIPIN_BEEPORT_BATCH_ID` or let omnipin pick
  // it up from the StampsRegistry once the Bee node has indexed it.
  throw new MissingKeyError('BEEPORT_BATCH_ID')
}

export const uploadOnBeeport: UploadFunction<{ beeportURL?: string }> = async ({
  bytes,
  name,
  size,
  verbose,
  first,
  beeportURL,
}) => {
  if (!first) throw new PinningNotSupportedError(providerName)

  // The provider signs uploads with its own dedicated key. `OMNIPIN_PK` is
  // reserved for ENS / Safe writes and must NOT be reused here.
  const privateKey = process.env.OMNIPIN_BEEPORT_TOKEN as Hex | undefined
  if (!privateKey) throw new MissingKeyError('BEEPORT_TOKEN')

  const url =
    beeportURL ?? process.env.OMNIPIN_BEEPORT_URL ?? DEFAULT_BEEPORT_URL

  const signer = fromPublicKey(getPublicKey({ privateKey }))
  // Prefer the actual upload size when picking a batch. Falls back to the
  // byte length of the encoded body for unit tests where `size` may not
  // match `bytes.byteLength`.
  const sizeBytes = BigInt(size > 0 ? size : bytes.byteLength)
  const batchId = await resolveBatchId({
    signer,
    sizeBytes,
    beeportURL: url,
    verbose,
  })

  // Beeport's backend defaults `messageContent` to `${fileName}:${batchId}`
  // when the header is omitted, but signing the exact string we send is more
  // explicit and avoids any header-normalisation surprises.
  const fileName = name || 'upload'
  const messageContent = `${fileName}:${batchId}`
  const signedMessage = personalSign({
    message: messageContent,
    privateKey,
  })

  const res = await fetch(`${url}/bzz`, {
    body: new Blob([bytes]),
    headers: {
      'Content-Type': 'application/x-tar',
      'Swarm-Postage-Batch-Id': batchId.replace(/^0x/, ''),
      'Swarm-Index-Document': 'index.html',
      'Swarm-Error-Document': 'index.html',
      'Swarm-Collection': 'true',
      'x-upload-signed-message': signedMessage,
      'x-uploader-address': signer,
      'x-file-name': fileName,
      'x-message-content': messageContent,
    },
    method: 'POST',
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const json = (await res.json()) as { reference?: string; message?: string }

  if (!res.ok) {
    throw new DeployError(providerName, json.message ?? `HTTP ${res.status}`)
  }

  if (!json.reference) {
    throw new DeployError(providerName, 'Missing reference in response')
  }

  return {
    cid: referenceToCIDString(`0x${json.reference}`),
    rID: json.reference,
  }
}
