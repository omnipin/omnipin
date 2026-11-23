import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { getReusableDataSets } from '../../src/providers/ipfs/filecoin-datasets.js'

describe('Filecoin upload data set reuse', () => {
  const providerId = 7n
  const zeroDataSet = { dataSetId: 0n, providerId, pdpEndEpoch: 0n }

  it('finds no reusable data set when the only active match has ID zero', () => {
    assert.deepStrictEqual(getReusableDataSets([zeroDataSet], providerId), [])
  })

  it('keeps the active nonzero data set from the chosen provider', () => {
    const activeDataSet = { dataSetId: 42n, providerId, pdpEndEpoch: 0n }
    const dataSets = [
      zeroDataSet,
      { dataSetId: 40n, providerId: 8n, pdpEndEpoch: 0n },
      { dataSetId: 41n, providerId, pdpEndEpoch: 123n },
      activeDataSet,
    ]

    assert.deepStrictEqual(getReusableDataSets(dataSets, providerId), [
      activeDataSet,
    ])
  })
})
