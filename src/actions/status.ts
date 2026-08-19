import { PROVIDERS } from '../constants.js'
import {
  AllProvidersFailedError,
  NoProvidersError,
  UnknownProviderError,
} from '../errors.js'
import { findEnvVarProviderName, parseTokensFromEnv } from '../utils/env.js'
import { assertCID } from '../utils/ipfs.js'
import { logger } from '../utils/logger.js'
import { pinStatus } from '../utils/pin.js'

export const statusAction = async ({
  cid,
  options = {},
}: {
  cid: string
  options?: Partial<{ providers: string; verbose: boolean }>
}) => {
  const { providers: providersOptionList, verbose } = options
  assertCID(cid)

  const env = parseTokensFromEnv()
  const tokens: string[] = []

  if (!providersOptionList)
    for (const option of env.keys()) {
      if (option?.endsWith('_TOKEN')) tokens.push(option)
    }

  if (providersOptionList) {
    for (const option of providersOptionList.split(',').map((s) => s.trim())) {
      const tokenName = findEnvVarProviderName(option)
      if (tokenName) tokens.push(tokenName)
      else throw new UnknownProviderError(option)
    }
  }

  if (tokens.length === 0) throw new NoProvidersError()

  const providers = tokens.map((token) => PROVIDERS[token])

  // `allSettled`, not `all`: one provider being down, rate-limited or holding a
  // stale token must not suppress the statuses of every other provider.
  const results = await Promise.allSettled(
    providers.map(async (provider, i) => {
      const token = tokens[i]
      if (provider?.status) {
        const { pin } = await provider.status({
          cid,
          auth: {
            token: env.get(token),
          },
          verbose,
          baseURL: env.get('SPEC_URL'),
        })
        pinStatus(provider.name, pin)
      }
    }),
  )

  const errors: Error[] = []
  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') {
      logger.error(
        `Failed to read status from ${providers[i]?.name ?? tokens[i]}`,
        result.reason,
      )
      errors.push(result.reason as Error)
    }
  }

  // Every provider that could have reported a status failed, so the command
  // printed nothing useful — keep the non-zero exit it had before.
  const queried = providers.filter((p) => p?.status).length
  if (errors.length !== 0 && errors.length === queried) {
    throw new AllProvidersFailedError('status', errors)
  }
}
