import { isDelegation } from '@ucanto/core/delegation'
import * as Receipt from '@ucanto/core/receipt'
import type { Block, Capability, UCANLink } from '@ucanto/interface'
import * as CAR from '@ucanto/transport/car'
import { receiptsEndpoint } from './constants.js'

const WAIT_MS = 3000

export async function poll<C extends Capability>(taskCid: UCANLink<[C]>) {
  await new Promise((r) => setTimeout(r, WAIT_MS))
  const res = await get(taskCid)
  if (res.error) throw res.error
  return res.ok
}

export async function get<C extends Capability>(taskCid: UCANLink<[C]>) {
  const endpoint = receiptsEndpoint

  // Fetch receipt from endpoint
  const url = new URL(taskCid.toString(), endpoint)
  const workflowResponse = await fetch(url)
  /* c8 ignore start */
  if (workflowResponse.status === 404) {
    return {
      error: new DOMException('Receipt not found', 'NotFoundError'),
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
      error: new DOMException(
        `failed to fetch receipt for task: ${taskCid}`,
        'AbortError',
      ),
    }
  }
  return {
    ok: receipt,
  }
}
