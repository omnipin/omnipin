import {
  type Ability,
  type Capability,
  type ConnectionView,
  connect,
} from '@ucanto/client'
import type { API } from '@ucanto/core'
import type { EdSigner } from '@ucanto/principal/ed25519'
import { outbound as CAR_outbound } from '@ucanto/transport/car'
import * as HTTP from '@ucanto/transport/http'
import { uploadServicePrincipal, uploadServiceURL } from './constants.js'
import { canDelegateCapability, isExpired, isTooEarly } from './delegations.js'
import type { ResourceQuery, Service } from './types.js'

interface CapabilityQuery {
  can: Ability
  with: ResourceQuery
  nb?: unknown
}

export const connection: ConnectionView<Service> = connect({
  id: uploadServicePrincipal,
  codec: CAR_outbound,
  channel: HTTP.open({
    url: uploadServiceURL,
    method: 'POST',
  }),
})

type AgentData = {
  delegations: Map<string, { delegation: API.Delegation }>
  principal: EdSigner
}

export class Agent {
  #data: AgentData
  connection: ConnectionView<Service>

  constructor(data: AgentData) {
    this.connection = connection
    this.#data = data
  }

  get issuer() {
    return this.#data.principal
  }

  proofs(caps: CapabilityQuery[]) {
    const authorizations: Map<
      string,
      API.Delegation<API.Capabilities>
    > = new Map()

    const _caps = new Set(caps)
    const delegations: API.Delegation[] = []

    for (const [, { delegation }] of this.#data.delegations) {
      if (!isExpired(delegation) && !isTooEarly(delegation)) {
        // check if we need to filter for caps
        if (Array.isArray(caps) && caps.length > 0) {
          for (const cap of _caps) {
            if (canDelegateCapability(delegation, cap as Capability)) {
              delegations.push(delegation)
            }
          }
        } else {
          delegations.push(delegation)
        }
      }
    }

    for (const delegation of delegations) {
      if (delegation.audience.did() === this.issuer.did()) {
        authorizations.set(delegation.cid.toString(), delegation)
      }
    }

    return [...authorizations.values()]
  }
}
