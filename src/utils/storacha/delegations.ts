import type * as Ucanto from '@ucanto/interface'
import { canDelegateAbility } from './capabilities.js'
import type { ResourceQuery } from './types.js'

export function isExpired(delegation: Ucanto.Delegation): boolean {
  return (
    delegation.expiration === undefined ||
    delegation.expiration <= Math.floor(Date.now() / 1000)
  )
}

export function isTooEarly(delegation: Ucanto.Delegation): boolean {
  return delegation.notBefore
    ? delegation.notBefore > Math.floor(Date.now() / 1000)
    : false
}

const matchResource = (resource: string, query: ResourceQuery): boolean => {
  if (typeof query === 'string') return query === 'ucan:*' || resource === query
  return query.test(resource)
}

const allows = (...delegations: Ucanto.Delegation[]) => {
  const allow: Ucanto.Allows = {}
  for (const delegation of delegations) {
    for (const { with: uri, can, nb } of delegation.capabilities) {
      if (!allow[uri]) allow[uri] = {}
      const resource = allow[uri]
      if (!resource[can]) resource[can] = []
      const abilities = resource[can]
      abilities.push(nb as Record<string, unknown>)
    }
  }

  return /** @type {API.InferAllowedFromDelegations<T>} */ (allow)
}

export function canDelegateCapability(
  delegation: Ucanto.Delegation,
  capability: Ucanto.Capability,
): boolean {
  const allowsCapabilities = allows(delegation)

  for (const [uri, abilities] of Object.entries(allowsCapabilities)) {
    if (matchResource(uri, capability.with)) {
      for (const can of Object.keys(abilities) as Ucanto.Ability[])
        if (canDelegateAbility(can, capability.can)) return true
    }
  }
  return false
}
