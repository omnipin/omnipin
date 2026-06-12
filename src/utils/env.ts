import type { Hex } from 'ox/Hex'
import { PROVIDERS } from '../constants.js'
import { MissingKeyError, UnknownProviderError } from '../errors.js'

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
export const findEnvVarProviderName = (provider: string): string => {
  for (const [token, { name }] of Object.entries(PROVIDERS)) {
    if (provider === name) return token
  }
  const known = Object.values(PROVIDERS)
    .map((p) => p.name)
    .join(', ')
  throw new Error(`Unknown provider: '${provider}'. Known providers: ${known}`)
}

/**
 * Resolve the signing key for an onchain action (`deposit`, `bridge`).
 *
 * Providers whose wallet key is configured under a provider-specific env var
 * for `deploy` (e.g. Filecoin uses `OMNIPIN_FILECOIN_TOKEN`) reuse that same
 * variable here so users only manage a single key per provider. The generic
 * `OMNIPIN_PK` is always accepted as a fallback.
 *
 * @param provider - Provider display name (e.g. `Filecoin`).
 * @returns The resolved private key.
 * @throws {MissingKeyError} If neither the provider-specific key nor
 *   `OMNIPIN_PK` is set. The error names the provider-specific variable when
 *   the provider has one.
 */
export const resolveSignerKey = (provider: string): Hex => {
  const providerEnvKey = `OMNIPIN_${findEnvVarProviderName(provider)}`
  const providerKey = process.env[providerEnvKey] as Hex | undefined
  if (providerKey) return providerKey

  const pk = process.env.OMNIPIN_PK as Hex | undefined
  if (pk) return pk

  throw new MissingKeyError(findEnvVarProviderName(provider))
}

/**
 * Resolve the signing key for Fula's onchain `deposit`.
 *
 * Unlike Filecoin (whose `OMNIPIN_FILECOIN_TOKEN` *is* a private key), Fula's
 * `OMNIPIN_FULA_TOKEN` holds the pinning-service JWT, not a wallet key — so it
 * must never be used to sign. The wallet key is read from the dedicated
 * `OMNIPIN_FULA_PK`, falling back to the generic `OMNIPIN_PK`.
 *
 * @throws {MissingKeyError} If neither `OMNIPIN_FULA_PK` nor `OMNIPIN_PK` is set.
 */
export const resolveFulaSignerKey = (): Hex => {
  const fulaPk = process.env.OMNIPIN_FULA_PK as Hex | undefined
  if (fulaPk) return fulaPk

  const pk = process.env.OMNIPIN_PK as Hex | undefined
  if (pk) return pk

  throw new MissingKeyError('FULA_PK')
}
