import * as cborg from 'cborg'
import { type ByteView, CID } from 'multiformats/cid'

const CID_CBOR_TAG = 42

function cidEncoder(obj: CID) {
  if (obj.asCID !== obj && obj['/'] !== obj.bytes) {
    return null // any other kind of object
  }
  const cid = CID.asCID(obj)
  // very unlikely case, and it'll probably throw a recursion error in cborg
  if (!cid) {
    return null
  }
  const bytes = new Uint8Array(cid.bytes.byteLength + 1)
  bytes.set(cid.bytes, 1) // prefix is 0x00, for historical reasons
  return [
    new cborg.Token(cborg.Type.tag, CID_CBOR_TAG),
    new cborg.Token(cborg.Type.bytes, bytes),
  ]
}

function numberEncoder(num: number) {
  return null
}

function mapEncoder(map: Map<unknown, unknown>) {
  return null
}

const _encodeOptions = {
  float64: true,
  typeEncoders: {
    Map: mapEncoder,
    Object: cidEncoder,
    number: numberEncoder,
  },
}

export const code = 0x71

export const encodeOptions = {
  ..._encodeOptions,
  typeEncoders: {
    ..._encodeOptions.typeEncoders,
  },
}

export const encode = <T>(node: unknown): ByteView<T> =>
  cborg.encode(node, _encodeOptions)
