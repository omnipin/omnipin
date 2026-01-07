import {
  asyncIterableReader,
  type BytesReader,
  createDecoder,
} from '@ipld/car/decoder'

async function decodeIterator(reader: BytesReader) {
  const decoder = createDecoder(reader)
  const { version, roots } = await decoder.header()
  return { version, roots, iterator: decoder.blocks() }
}

export async function fromIterable(asyncIterable: AsyncIterable<Uint8Array>) {
  if (
    !asyncIterable ||
    !(typeof asyncIterable[Symbol.asyncIterator] === 'function')
  ) {
    throw new TypeError('fromIterable() requires an async iterable')
  }
  return decodeIterator(asyncIterableReader(asyncIterable))
}
