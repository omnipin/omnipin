import type { Capabilities, Fact } from '@ipld/dag-ucan'
import { DID } from '@ucanto/core/schema'

type Delegation = { facts: Fact[]; capabilities: Capabilities }

type SharedSpaceModel = {
  id: `did:key:${string}`
  delegation: Delegation
}

export class SharedSpace {
  model: SharedSpaceModel
  constructor(model: SharedSpaceModel) {
    this.model = model
  }

  did() {
    return this.model.id
  }
}

export const fromDelegation = ({
  facts,
  capabilities,
}: Delegation): SharedSpace => {
  const result = DID.match({ method: 'key' }).read(capabilities[0].with)
  if (result.error) {
    throw new Error(
      `Invalid delegation, expected capabilities[0].with to be DID, ${result.error}`,
      { cause: result.error },
    )
  }

  return new SharedSpace({
    id: result.ok,
    delegation: { facts, capabilities },
  })
}
