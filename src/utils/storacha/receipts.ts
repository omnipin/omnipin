import { isDelegation } from '@ucanto/core/delegation'
import * as Receipt from '@ucanto/core/receipt'
import type { Block, Capability, UCANLink } from '@ucanto/interface'
import { CAR } from '@ucanto/transport'
import type { UnknownLink } from 'multiformats'
import { retry } from '../retry.js'
import { REQUEST_RETRIES, receiptsEndpoint } from './constants.js'

class ReceiptNotFound extends Error {
  name = 'ReceiptNotFound' as const
  taskCid: UnknownLink

  constructor(taskCid: UnknownLink) {
    super()
    this.taskCid = taskCid
  }

  get reason() {
    return `receipt not found for task ${this.taskCid} in the indexed workflow`
  }
}

class ReceiptMissing extends Error {
  name = 'ReceiptMissing' as const
  taskCid: UnknownLink

  constructor(taskCid: UnknownLink) {
    super()
    this.taskCid = taskCid
  }

  get reason() {
    return `receipt missing for task ${this.taskCid}`
  }
}

export async function poll<C extends Capability>(taskCid: UCANLink<[C]>) {
  return await retry(
    async () => {
      const res = await get(taskCid)
      if (res.error) {
        if (res.error.name === 'ReceiptNotFound') {
          throw res.error
        } else {
          throw new DOMException(
            `failed to fetch receipt for task: ${taskCid}`,
            'AbortError',
          )
        }
      }
      return res.ok
    },
    {
      onFailedAttempt: console.warn,
      retries: REQUEST_RETRIES,
    },
  )
}
/**
 * Get a receipt for an executed task by its CID.
 */
export async function get<C extends Capability>(taskCid: UCANLink<[C]>) {
  const endpoint = receiptsEndpoint

  // Fetch receipt from endpoint
  const url = new URL(taskCid.toString(), endpoint)
  const workflowResponse = await fetch(url)
  /* c8 ignore start */
  if (workflowResponse.status === 404) {
    return {
      error: new ReceiptNotFound(taskCid),
    }
  }
  /* c8 ignore stop */
  // Get receipt from Message Archive
  const agentMessageBytes = new Uint8Array(await workflowResponse.arrayBuffer())
  // Decode message
  const agentMessage = await CAR.request.decode({
    body: agentMessageBytes,
    headers: {},
  })
  // Get receipt from the potential multiple receipts in the message

  const receipt = agentMessage.receipts.get(`${taskCid}`)
  if (!receipt) {
    // This could be an agent message containing an invocation for ucan/conclude
    // that includes the receipt as an attached block, or it may contain a
    // receipt for ucan/conclude that includes the receipt as an attached block.
    const blocks = new Map<string, Block<unknown, number, number, 1>>()
    for (const b of agentMessage.iterateIPLDBlocks()) {
      blocks.set(b.cid.toString(), b)
    }
    const invocations = [...agentMessage.invocations]
    for (const receipt of agentMessage.receipts.values()) {
      if (isDelegation(receipt.ran)) {
        invocations.push(receipt.ran)
      }
    }
    for (const inv of invocations) {
      if (inv.capabilities[0]?.can !== 'ucan/conclude') continue
      const root = Object(inv.capabilities[0].nb).receipt
      const receipt = root ? Receipt.view({ root, blocks }, null) : null
      if (!receipt) continue
      const ran = isDelegation(receipt.ran) ? receipt.ran.cid : receipt.ran
      if (ran.toString() === taskCid.toString()) {
        return { ok: receipt }
      }
    }
    return {
      error: new ReceiptMissing(taskCid),
    }
  }
  return {
    ok: receipt,
  }
}
