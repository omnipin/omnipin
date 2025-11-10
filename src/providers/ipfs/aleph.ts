import { fromPublicKey } from 'ox/Address'
import { toHex } from 'ox/Bytes'
import type { Hex } from 'ox/Hex'
import { getPublicKey, sign } from 'ox/Secp256k1'
import * as Signature from 'ox/Signature'
import { DeployError } from '../../errors.js'
import type { PinFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'

const baseURL = 'https://api2.aleph.im'
const te = new TextEncoder()

const providerName = 'Aleph'

type Chain = 'ETH' | 'AVAX' | 'BASE'

export const pinToAleph: PinFunction<{ token: Hex; chain: Chain }> = async ({
  cid,
  token,
  chain = 'ETH',
  verbose,
}) => {
  const message = {
    chain,
    sender: fromPublicKey(getPublicKey({ privateKey: token })),
    type: 'STORE',
    channel: 'POWERED-BY-OMNIPIN',
    time: Date.now() / 1000,
    item_type: 'ipfs',
    item_hash: cid,
    item_content: null,
    signature: undefined as Hex | undefined,
    signature_type: 'eth_personal',
  }

  const stringToSign = `${message.sender}|${message.chain}|${message.type}|${message.item_hash}`
  const sig = sign({
    privateKey: token,
    payload: toHex(te.encode(stringToSign)),
  })

  message.signature = Signature.toHex(sig)

  const res = await fetch(`${baseURL}/api/v0/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (verbose) logger.request('POST', res.url, res.status)

  if (!res.ok) {
    const text = await res.text()

    if (text.startsWith('{')) {
      const json = JSON.parse(text)
      throw new DeployError(providerName, json[0].msg, {
        cause: text,
      })
    }
    throw new DeployError(providerName, text, { cause: text })
  }

  const json = await res.json()

  return { cid, status: json.publication_status.status }
}
