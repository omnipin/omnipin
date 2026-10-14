import assert from 'node:assert'
import { describe, it } from 'node:test'
// Import from src/index.js first: starting module evaluation at spec.js
// trips the logger → constants → spec import cycle (see
// filecoin-status.test.ts, which relies on the same ordering).
import { UploadNotSupportedError } from '../../src/index.js'
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
