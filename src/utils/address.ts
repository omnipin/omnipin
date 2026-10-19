import * as Address from 'ox/Address'
import * as Secp256k1 from 'ox/Secp256k1'

/** The zero address — `ox` ships no constant for it. */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * Derive the Ethereum address of a private key.
 *
 * @param key - Private key hex, with or without the `0x` prefix.
 * @returns The address, or `undefined` when the key isn't a valid secp256k1 key.
 */
export const addressFromPrivateKey = (key: string): string | undefined => {
  const privateKey = `0x${key.replace(/^0x/i, '')}` as `0x${string}`
  try {
    return Address.fromPublicKey(Secp256k1.getPublicKey({ privateKey }))
  } catch {
    return undefined
  }
}
