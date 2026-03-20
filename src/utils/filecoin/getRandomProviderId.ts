import type { FilecoinChain } from './constants.js'
import { getApprovedSPs } from './getApprovedSPs.js'

export const getRandomProviderId = async ({
  chain,
}: {
  chain: FilecoinChain
}) => {
  const ids = await getApprovedSPs({ chain })

  const randomIndex = Math.floor(Math.random() * ids.length)
  return ids[randomIndex]
}
