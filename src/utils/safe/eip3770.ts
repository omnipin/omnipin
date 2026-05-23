import { type Address, checksum, validate } from 'ox/Address'

export function parseEip3770Address(
  fullAddress: EIP3770Address | Address,
): Eip3770AddressInterface {
  const parts = fullAddress.split(':')
  if (parts.length > 2) {
    throw new Error(
      `Invalid EIP-3770 address: expected at most one ":" separator, got "${fullAddress}"`,
    )
  }
  const address = checksum(parts.length > 1 ? parts[1] : parts[0])
  const prefix = parts.length > 1 ? parts[0] : ''
  return { prefix, address }
}

function validateEthereumAddress(address: string): void {
  if (!validate(address)) throw new Error(`Invalid Ethereum address ${address}`)
}

const isValidEip3770NetworkPrefix = (prefix: string): boolean =>
  networks.some(({ shortName }) => shortName === prefix)

function getEip3770NetworkPrefixFromChainId(chainId: number): string {
  const network = networks.find((network) => chainId === network.chainId)
  if (!network)
    throw new Error('No network prefix supported for the current chainId')

  return network.shortName
}

function validateEip3770NetworkPrefix(
  prefix: string,
  currentChainId: number,
): void {
  const isCurrentNetworkPrefix =
    prefix === getEip3770NetworkPrefixFromChainId(currentChainId)
  if (!isValidEip3770NetworkPrefix(prefix) || !isCurrentNetworkPrefix) {
    throw new Error('The network prefix must match the current network')
  }
}

export interface Eip3770AddressInterface {
  prefix: string
  address: Address
}

export type EIP3770Address = `${string}:${Address}`

export function getEip3770Address({
  fullAddress,
  chainId,
}: {
  fullAddress: EIP3770Address | Address
  chainId: number
}): Eip3770AddressInterface {
  const { address, prefix } = parseEip3770Address(fullAddress)
  validateEthereumAddress(address)
  if (prefix) validateEip3770NetworkPrefix(prefix, chainId)

  return { address, prefix }
}

interface NetworkShortName {
  shortName: string
  chainId: number
}

const networks: NetworkShortName[] = [
  { chainId: 1, shortName: 'eth' },
  { chainId: 11155111, shortName: 'sep' },
]
