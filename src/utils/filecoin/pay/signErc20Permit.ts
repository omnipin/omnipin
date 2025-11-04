import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { sign } from 'ox/Secp256k1'
import { getSignPayload } from 'ox/TypedData'
import {
  FILECOIN_PAY_ADDRESS,
  filecoinCalibration,
  USDFC_ADDRESS,
} from '../constants.js'

export const signErc20Permit = async ({
  privateKey,
  address,
  amount,
  nonce,
  deadline,
  name,
  version,
}: {
  privateKey: Hex
  address: Address
  amount: bigint
  nonce: bigint
  deadline: bigint
  name: string
  version: string
}) => {
  return sign({
    privateKey,
    payload: getSignPayload({
      domain: {
        chainId: filecoinCalibration.id,
        name,
        version,
        verifyingContract: USDFC_ADDRESS,
      },
      message: {
        owner: address,
        spender: FILECOIN_PAY_ADDRESS,
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
