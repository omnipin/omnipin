import { base32 } from 'multiformats/bases/base32'
import { create } from 'multiformats/hashes/digest'
import { decodeResult, encodeData } from 'ox/AbiFunction'
import { type Hex, toBytes } from 'ox/Hex'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'
import * as varint from 'varint'

const KECCAK_256_CODEC = 0x1b
const SWARM_MANIFEST_CODEC = 0xfa

/** Swarm-on-Gnosis mainnet `PostageStamp` contract. */
const POSTAGE_STAMP_ADDRESS = '0x45a1502382541Cd610CC9068e88727426b696293'
const DEFAULT_GNOSIS_RPC = 'https://rpc.gnosischain.com'

/**
 * `PostageStamp.batches(bytes32)` public-mapping getter — returns the on-chain
 * Batch struct fields in storage order. We only need `depth`, but decode the
 * full tuple so the ABI matches.
 */
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

/**
 * Read a postage batch's depth from the on-chain `PostageStamp` contract via a
 * single `eth_call` (no gas, no tx). The WASM `uploadCollection` needs the
 * exact depth the batch was created with — the per-bucket stamp index math
 * diverges from what bee expects otherwise.
 *
 * @throws if the batch ID isn't registered on-chain (zero owner + zero depth).
 */
export const resolveBatchDepth = async (
  batchIdHex: string,
  rpcUrl: string = DEFAULT_GNOSIS_RPC,
): Promise<number> => {
  const id = `0x${batchIdHex.replace(/^0x/i, '')}` as Hex
  const provider = Provider.from(fromHttp(rpcUrl))

  const result = await provider.request({
    method: 'eth_call',
    params: [
      { data: encodeData(batchesAbi, [id]), to: POSTAGE_STAMP_ADDRESS },
      'latest',
    ],
  })

  const [owner, depth] = decodeResult(batchesAbi, result)
  if (owner === '0x0000000000000000000000000000000000000000' && depth === 0) {
    throw new Error(`Postage batch ${id} not found on-chain`)
  }
  return Number(depth)
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
