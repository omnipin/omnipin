import { Signer } from '@ucanto/principal/ed25519'
import { Agent } from './agent.js'
import type { AgentDataExport } from './agent-data.js'
import * as Proof from './proof.js'
import { fromDelegation, type SharedSpace } from './space.js'

export async function setup({
  pk,
  proof,
}: {
  pk: string
  proof: string
}): Promise<{ agent: Agent; space: SharedSpace }> {
  const principal = Signer.parse(pk)

  const agentData = {
    meta: { name: 'agent', type: 'device' },
    principal,
    delegations: new Map(),
  } as const

  const agent = new Agent(agentData)
  try {
    const delegation = await Proof.parse(proof)
    const space = fromDelegation(delegation)

    agentData.delegations.set(delegation.cid.toString(), {
      delegation,
      meta: {},
    })

    const raw: AgentDataExport = {
      meta: agentData.meta,
      principal: principal.toArchive(),
      delegations: new Map(),
    }
    for (const [key, value] of agentData.delegations) {
      raw.delegations.set(key, {
        meta: value.meta,
        delegation: [...value.delegation.export()].map((b) => ({
          cid: b.cid.toString(),
          bytes: b.bytes.buffer.slice(
            b.bytes.byteOffset,
            b.bytes.byteOffset + b.bytes.byteLength,
          ) as ArrayBuffer,
        })),
      })
    }

    return { agent, space }
  } catch (e) {
    throw new Error('Failed to parse UCAN proof', { cause: e })
  }
}
