import type { Address } from 'ox/Address'
import type { Provider } from 'ox/Provider'
import type { EthereumChain } from '../../constants.js'
import { resolveEnsName } from '../ens/ur.js'
import { getEip3770Address } from '../safe/eip3770.js'

export const getExactAddress = async ({
  addressOrEns,
  provider,
  chain,
}: {
  addressOrEns: string
  provider: Provider
  chain: EthereumChain
}) => {
  if (addressOrEns.endsWith('.eth'))
    return await resolveEnsName({ name: addressOrEns, provider })
  return getEip3770Address({
    fullAddress: addressOrEns as Address,
    chainId: chain.id,
  }).address
}
