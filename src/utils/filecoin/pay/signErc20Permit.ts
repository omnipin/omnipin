import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { sign } from 'ox/Secp256k1'
import { getSignPayload } from 'ox/TypedData'
import type { FilecoinChain } from '../constants.js'

export const signErc20Permit = async ({
  privateKey,
  address,
  amount,
  nonce,
  deadline,
  name,
  version,
  chain,
}: {
  privateKey: Hex
  address: Address
  amount: bigint
  nonce: bigint
  deadline: bigint
  name: string
  version: string
  chain: FilecoinChain
}) => {
  return sign({
    privateKey,
    payload: getSignPayload({
      domain: {
        chainId: chain.id,
        name,
        version,
        verifyingContract: chain.contracts.usdfc.address,
      },
      message: {
        owner: address,
        spender: chain.contracts.payments.address,
        value: amount,
        nonce,
        deadline,
      },
      primaryType: 'Permit',
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    }),
  })
}
