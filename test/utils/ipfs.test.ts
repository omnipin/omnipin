import { describe, it } from 'bun:test'
import * as assert from 'node:assert'
import { assertCID, packCAR } from '../../src/utils/ipfs.js'

const te = new TextEncoder()

describe('ipfs utils', () => {
  describe('packCAR', () => {
    it('should pack files into a CAR and return blob and rootCID', async () => {
      const files = [
        {
          path: 'a.txt',
          content: te.encode('File A'),
        },
        {
          path: 'b.txt',
          content: te.encode('File B'),
        },
        {
          path: 'nested/c.txt',
          content: te.encode('File C'),
        },
      ]

      const { blob, rootCID } = await packCAR(files, 'test-car')

      assert.ok(blob instanceof Blob)
      assert.strictEqual(blob.type, 'application/vnd.ipld.car')
      assert.equal(blob.size, 468)
      assert.ok(rootCID)
      assert.ok(rootCID.toString().startsWith('bafy'))
    })
  })

  describe('assertCID', () => {
    it('should not throw for valid base32 CID', () => {
      assert.doesNotThrow(() => {
        assertCID('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
      })
    })

    it('should throw for invalid CID', () => {
      assert.throws(
        () => {
          assertCID('invalid-cid')
        },
        {
          name: 'InvalidCIDError',
        },
      )
    })
  })
})
