import { fromPublicKey } from 'ox/Address'
import * as Hash from 'ox/Hash'
import type { Hex } from 'ox/Hex'
import { fromNumber, fromString } from 'ox/Hex'
import { getSignPayload } from 'ox/PersonalMessage'
import { getPublicKey, sign } from 'ox/Secp256k1'
import { DeployError } from '../../errors.js'
import type { PinFunction, PinStatus, StatusFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'

const baseURL = 'https://api2.aleph.im'
const channel = 'POWERED-BY-OMNIPIN'

const providerName = 'Aleph'

type Chain = 'ETH' | 'AVAX' | 'BASE'

/**
 * Build an EIP-191 (`personal_sign`) signature over the Aleph verification
 * buffer, serialized as `r || s || v` with `v` in {27, 28} — the format the
 * Aleph CCN expects (equivalent to ethers' `wallet.signMessage`).
 */
const signVerificationBuffer = (privateKey: Hex, buffer: string): Hex => {
  const sig = sign({ privateKey, payload: getSignPayload(fromString(buffer)) })
  const r = fromNumber(sig.r, { size: 32 }).slice(2)
  const s = fromNumber(sig.s, { size: 32 }).slice(2)
  const v = (27 + sig.yParity).toString(16).padStart(2, '0')
  return `0x${r}${s}${v}`
}

export const pinToAleph: PinFunction<{ token: Hex; chain: Chain }> = async ({
  cid,
  token,
  chain,
  verbose,
}) => {
  const sender = fromPublicKey(getPublicKey({ privateKey: token }))
  const time = Date.now() / 1000

  // Inline STORE content; for an IPFS pin the inner `item_hash` is the CID.
  const content = {
    address: sender,
    item_type: 'ipfs',
    item_hash: cid,
    time,
  }

  // The message is published inline: `item_content` is the serialized content
  // and the message-level `item_hash` is its sha256 hash.
  const itemContent = JSON.stringify(content)
  const itemHash = Hash.sha256(fromString(itemContent), { as: 'Hex' }).slice(2)

  // Verification buffer is `chain\nsender\ntype\nitem_hash`.
  const signature = signVerificationBuffer(
    token,
    [chain, sender, 'STORE', itemHash].join('\n'),
  )

  const message = {
    chain,
    sender,
    channel,
    time,
    item_type: 'inline',
    item_hash: itemHash,
    item_content: itemContent,
    signature,
    type: 'STORE',
  }

  const res = await fetch(`${baseURL}/api/v0/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sync: false, message }),
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }

  if (!res.ok) {
    const reason =
      (Array.isArray(json) && json[0]?.msg) ||
      (json as { error?: string })?.error ||
      text ||
      'Pinning failed'
    throw new DeployError(providerName, reason, { cause: text })
  }

  // Aleph accepts STORE messages into a queue; they become `pinned` only once
  // processed/confirmed by the network. A successful POST means `queued`.
  const accepted =
    (json as { publication_status?: { status?: string } })?.publication_status
      ?.status === 'success'

  return { cid, status: accepted ? 'queued' : 'unknown' }
}

export const statusOnAleph: StatusFunction = async ({ cid, auth, verbose }) => {
  if (!auth.token) return { pin: 'not pinned' }

  const sender = fromPublicKey(getPublicKey({ privateKey: auth.token as Hex }))

  const url = new URL(`${baseURL}/api/v0/messages.json`)
  url.searchParams.set('addresses', sender)
  url.searchParams.set('channels', channel)
  url.searchParams.set('msgTypes', 'STORE')
  url.searchParams.set('pagination', '200')

  const res = await fetch(url)

  if (verbose) logger.request('GET', res.url, res.status)

  if (!res.ok) return { pin: 'unknown' }

  const json = await res.json()
  const messages: Array<{
    confirmed?: boolean
    content?: { item_hash?: string }
  }> = json.messages ?? []

  const match = messages.find((m) => m.content?.item_hash === cid)

  if (!match) return { pin: 'not pinned' }

  const pin: PinStatus = match.confirmed ? 'pinned' : 'queued'
  return { pin }
}
