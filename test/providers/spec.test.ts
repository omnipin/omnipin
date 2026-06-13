import { describe, it } from 'bun:test'
import assert from 'node:assert'
import { UploadNotSupportedError } from '../../src/errors.js'
import { specPin } from '../../src/providers/ipfs/spec.js'

describe('spec provider', () => {
  describe('pin', () => {
    it('should throw if pinning was chosen as a first provider', () => {
      assert.rejects(async () => {
        // @ts-expect-error only checking if it throws by passing `first`
        return await specPin({ first: true, providerName: 'Test' })
      }, new UploadNotSupportedError('Test'))
    })
  })
})
