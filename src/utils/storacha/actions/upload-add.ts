import type { UploadAddSuccess } from '@storacha/capabilities/types'
import * as UploadCapabilities from '@storacha/capabilities/upload'
import { SpaceDID } from '@storacha/capabilities/utils'
import type { UnknownLink } from 'multiformats/link'
import { retry } from '../../retry.js'
import { connection } from '../agent.js'
import { uploadServicePrincipal } from '../constants.js'
import type { CARLink, InvocationConfig } from '../types.js'
/**
 * Register an "upload" with the service. The issuer needs the `upload/add`
 * delegated capability.
 *
 * Required delegated capability proofs: `upload/add`
 */
export async function add(
  { issuer, with: resource, proofs }: InvocationConfig,
  root: UnknownLink,
  shards: CARLink[],
): Promise<UploadAddSuccess> {
  const result = await retry(
    async () => {
      return await UploadCapabilities.add
        .invoke({
          issuer,
          audience: uploadServicePrincipal,
          with: SpaceDID.from(resource),
          nb: { root, shards },
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
    throw new Error(`failed ${UploadCapabilities.add.can} invocation`, {
      cause: result.out.error,
    })
  }
  return result.out.ok
}
