import { PROVIDERS } from '../constants.js'
import { UnknownProviderError } from '../errors.js'

export const parseTokensFromEnv = (): Map<string, string> => {
  const tokens = new Map<string, string>()

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('OMNIPIN_') && value) tokens.set(key.slice(8), value)
  }
  return tokens
}

// ESTUARY_TOKEN => Estuary
export const tokensToProviderNames = (
  keys: IterableIterator<string> | string[],
): string[] => {
  const providers: string[] = []
  for (const key of keys) {
    const provider = PROVIDERS[key]
    if (provider) providers.push(provider.name)
    else if (key.includes('_TOKEN')) throw new UnknownProviderError(key)
  }
  return providers
}

/**
 * Estuary => ESTUARY_TOKEN
 */
export const findEnvVarProviderName = (
  provider: string,
): string | undefined => {
  for (const [token, { name }] of Object.entries(PROVIDERS)) {
    if (provider === name) return token
  }
}
