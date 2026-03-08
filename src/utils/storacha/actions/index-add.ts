import * as IndexCapabilities from '@storacha/capabilities/space/index'
import type { CARLink } from '@storacha/capabilities/types'
import { SpaceDID } from '@storacha/capabilities/utils'
import { retry } from '../../retry.js'
import { connection } from '../agent.js'
import { uploadServicePrincipal } from '../constants.js'
import type { InvocationConfig } from '../types.js'
/**
 * Register an "index" with the service. The issuer needs the `index/add`
 * delegated capability.
 *
 * Required delegated capability proofs: `index/add`
 */
export async function add(
  { issuer, with: resource, proofs }: InvocationConfig,
  index: CARLink,
) {
  const result = await retry(
    async () => {
      return await IndexCapabilities.add
        .invoke({
          issuer,
          audience: uploadServicePrincipal,
          with: SpaceDID.from(resource),
          nb: { index },
          proofs,
        })
        .execute(connection)
    },
    {
      onFailedAttempt: console.warn,
      retries: 3,
    },
  )
  if (!result.out.ok) {
    throw new Error(`failed ${IndexCapabilities.add.can} invocation`, {
      cause: result.out.error,
    })
  }
  return result.out.ok
}
