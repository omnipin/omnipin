import { encodeData } from 'ox/AbiFunction'
import { namehash } from 'ox/Ens'

const abi = {
  constant: true,
  inputs: [
    {
      name: 'node',
      type: 'bytes32',
    },
  ],
  name: 'addr',
  outputs: [
    {
      name: 'addr',
      type: 'address',
    },
  ],
  payable: false,
  stateMutability: 'view',
  type: 'function',
} as const

export const encodeEnsAddressRecordRequest = (name: string) =>
  encodeData(abi, [namehash(name)])
