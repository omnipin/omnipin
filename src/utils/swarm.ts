import { base32 } from 'multiformats/bases/base32'
import { create } from 'multiformats/hashes/digest'
import { decodeResult, encodeData } from 'ox/AbiFunction'
import { isEqual } from 'ox/Address'
import { type Hex, toBytes } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import varint from 'varint'
import { ZERO_ADDRESS } from './address.js'

const KECCAK_256_CODEC = 0x1b
const SWARM_MANIFEST_CODEC = 0xfa

const POSTAGE_STAMP_ADDRESS = '0x45a1502382541Cd610CC9068e88727426b696293'
const DEFAULT_GNOSIS_RPC = 'https://rpc.gnosischain.com'

const batchesAbi = {
  inputs: [{ name: 'id', type: 'bytes32' }],
  name: 'batches',
  outputs: [
    { name: 'owner', type: 'address' },
    { name: 'depth', type: 'uint8' },
    { name: 'bucketDepth', type: 'uint8' },
    { name: 'immutableFlag', type: 'bool' },
    { name: 'normalisedBalance', type: 'uint256' },
    { name: 'lastUpdatedBlockNumber', type: 'uint256' },
  ],
  stateMutability: 'view',
  type: 'function',
} as const

export type BatchInfo = {
  /** Batch depth (`2^depth` total stamps). */
  depth: number
  /** Immutable batches use fill-only stamping, mutable ones ring stamping. */
  immutable: boolean
  /** Address that owns the batch on-chain (the stamper's address). */
  owner: string
}

/**
 * Read a postage batch's metadata from the on-chain `PostageStamp` contract.
 *
 * The depth and the mutability both come from chain — a wrong depth breaks
 * the per-bucket index math, and a wrong mutability makes bee reject every
 * stamp.
 */
export const resolveBatch = async (
  batchIdHex: string,
  rpcUrl: string = DEFAULT_GNOSIS_RPC,
): Promise<BatchInfo> => {
  const id = `0x${batchIdHex.replace(/^0x/i, '')}` as Hex
  const provider = Provider.from(fromHttp(rpcUrl))

  const result = await provider.request({
    method: 'eth_call',
    params: [
      { data: encodeData(batchesAbi, [id]), to: POSTAGE_STAMP_ADDRESS },
      'latest',
    ],
  })

  const [owner, depth, , immutable] = decodeResult(batchesAbi, result)
  if (isEqual(owner, ZERO_ADDRESS) && depth === 0) {
    throw new Error(`Postage batch ${id} not found on-chain`)
  }
  return { depth: Number(depth), immutable: Boolean(immutable), owner }
}

function encodeCID(
  version: 1,
  code: number,
  multihash: Uint8Array,
): Uint8Array {
  const codeOffset = varint.encodingLength(version)
  const hashOffset = codeOffset + varint.encodingLength(code)
  const bytes = new Uint8Array(hashOffset + multihash.byteLength)
  varint.encode(version, bytes, 0)
  varint.encode(code, bytes, codeOffset)
  bytes.set(multihash, hashOffset)
  return bytes
}

export const referenceToCID = (ref: Hex): Uint8Array =>
  encodeCID(
    1,
    SWARM_MANIFEST_CODEC,
    create(KECCAK_256_CODEC, toBytes(ref)).bytes,
  )

export const referenceToCIDString = (ref: Hex): string =>
  base32.encode(referenceToCID(ref))
