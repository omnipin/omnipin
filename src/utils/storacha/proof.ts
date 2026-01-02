import type { Delegation } from '@ucanto/client'
import { extract } from '@ucanto/core/delegation'
import * as CAR from '@ucanto/transport/car'
import { base64 } from 'multiformats/bases/base64'
import * as Link from 'multiformats/link'

/**
 * Parses a base64 encoded CIDv1 CAR of proofs (delegations).
 */
export const parse = async (str: string): Promise<Delegation> => {
  const cid = Link.parse(str, base64)
  if (cid.code !== CAR.codec.code) {
    throw new Error(`non CAR codec found: 0x${cid.code.toString(16)}`)
  }

  const { ok, error } = await extract(cid.multihash.digest)
  if (error) throw new Error('failed to extract delegation', { cause: error })
  return ok
}
