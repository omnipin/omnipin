import { connect } from '@ucanto/client'
import type { API } from '@ucanto/core'
import type {
  Ability,
  Capability,
  ConnectionView,
  EdSigner,
} from '@ucanto/principal/ed25519'
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
    const shouldFilterByCaps = caps.length > 0

    for (const [, { delegation }] of this.#data.delegations) {
      if (isExpired(delegation) || isTooEarly(delegation)) {
        continue
      }

      if (delegation.audience.did() !== this.issuer.did()) {
        continue
      }

      if (
        shouldFilterByCaps &&
        !caps.some((cap) =>
          canDelegateCapability(delegation, cap as Capability),
        )
      ) {
        continue
      }

      authorizations.set(delegation.cid.toString(), delegation)
    }

    return [...authorizations.values()]
  }
}
