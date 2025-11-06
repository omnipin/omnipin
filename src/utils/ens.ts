import { CID } from 'multiformats/cid'
import type { Address } from 'ox/Address'
import { toHex } from 'ox/Bytes'
import { namehash, normalize } from 'ox/Ens'
import * as varint from 'varint'
import type { ChainName } from '../types.js'
import { referenceToCID } from './swarm.js'

const IFPS_CODEC = 0xe3
const SWARM_CODEC = 0xe4

const concatUint8Arrays = (
  array1: Uint8Array,
  array2: Uint8Array,
): Uint8Array => {
  const result = new Uint8Array(array1.length + array2.length)
  result.set(array1, 0)
  result.set(array2, array1.length)
  return result
}

export const prepareUpdateEnsArgs = ({
  cid,
  domain,
  codec = 'ipfs',
}: {
  cid: string
  domain: string
  codec?: 'ipfs' | 'swarm'
}): {
  contentHash: string
  node: `0x${string}`
} => {
  const node = namehash(normalize(domain))
  let code: number

  let bytes: Uint8Array
  switch (codec) {
    case 'ipfs':
      code = IFPS_CODEC
      bytes = CID.parse(cid).toV1().bytes
      break
    case 'swarm':
      code = SWARM_CODEC
      bytes = referenceToCID(`0x${cid}`).bytes
      break
  }

  const codeBytes = Uint8Array.from(varint.encode(code))

  return {
    contentHash: toHex(concatUint8Arrays(codeBytes, bytes)).slice(2),
    node,
  }
}

export const setContentHash = {
  name: 'setContenthash',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    {
      type: 'bytes32',
      name: 'node',
    },
    {
      type: 'bytes',
      name: 'contenthash',
    },
  ],
  outputs: [],
} as const

export const chainToRpcUrl = (chain: ChainName) => {
  switch (chain) {
    case 'mainnet':
      return 'https://ethereum-rpc.publicnode.com'
    case 'sepolia':
      return 'https://ethereum-sepolia-rpc.publicnode.com'
  }
}
