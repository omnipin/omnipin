import * as Storefront from '@storacha/capabilities/filecoin/storefront'
import type { PieceLink } from '@web3-storage/data-segment'
import type { Link } from 'multiformats'
import { connection } from './agent.js'
import { uploadServicePrincipal } from './constants.js'
import type { InvocationConfig } from './types.js'

export const filecoinOffer = async (
  conf: InvocationConfig,
  piece: PieceLink,
  content: Link,
) => {
  return Storefront.filecoinOffer
    .invoke({
      ...conf,
      audience: uploadServicePrincipal,
      nb: {
        content,
        piece,
      },
      expiration: Infinity,
    })
    .execute(connection)
}
