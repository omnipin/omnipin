import { afterEach, describe, expect, it } from 'bun:test'
import * as AbiParameters from 'ox/AbiParameters'
import { randomPrivateKey } from 'ox/Secp256k1'
// Import from src/index.js first: starting module evaluation at filecoin.js
// trips the logger → constants → filecoin import cycle (see
// filecoin.test.ts, which relies on the same ordering).
import { MissingKeyError } from '../../src/index.js'
import { statusOnFilecoin } from '../../src/providers/ipfs/filecoin.js'

const SP_URL = 'https://sp.example.com'
const PIECE_CID =
  'bafkzcibcoibrgmrvgiztgmjqgiztgmjqgiztgmjqgiztgmjqgiztgmjqgizq'
const OTHER_PIECE_CID =
  'bafkzcibcoibrgmrvgiztgmjqgiztgmjqgiztgmjqgiztgmjqgiztgmjqgjyq'

const originalFetch = globalThis.fetch

/**
 * Encode a getClientDataSets eth_call result the way the warm-storage view
 * contract actually returns it: the 13-field DataSetInfoView, including
 * pendingOneTimePayments and lifecycleReserveBalance. The "pinned" test
 * requires @omnipin/foc >= 0.0.19 (omnipin/foc#2) — 0.0.18 still decodes
 * the old 11-field layout and shears every tuple.
 */
const encodeDataSets = (
  dataSets: { dataSetId: bigint; pdpEndEpoch: bigint }[],
) =>
  AbiParameters.encode(
    AbiParameters.from([
      'struct DataSetInfoView { uint256 pdpRailId; uint256 cacheMissRailId; uint256 cdnRailId; address payer; address payee; address serviceProvider; uint256 commissionBps; uint256 clientDataSetId; uint256 pdpEndEpoch; uint256 providerId; uint96 pendingOneTimePayments; uint96 lifecycleReserveBalance; uint256 dataSetId; }',
      'DataSetInfoView[] infos',
    ]),
    [
      dataSets.map((ds) => ({
        pdpRailId: 1n,
        cacheMissRailId: 0n,
        cdnRailId: 0n,
        payer: '0x1111111111111111111111111111111111111111' as const,
        payee: '0x2222222222222222222222222222222222222222' as const,
        serviceProvider: '0x2222222222222222222222222222222222222222' as const,
        commissionBps: 0n,
        clientDataSetId: 1n,
        pdpEndEpoch: ds.pdpEndEpoch,
        providerId: 7n,
        pendingOneTimePayments: 0n,
        lifecycleReserveBalance: 0n,
        dataSetId: ds.dataSetId,
      })),
    ],
  )

/**
 * Stub fetch for both the SP's PDP endpoints and the Filecoin JSON-RPC node
 * (getClientDataSets goes through an eth_call). Returns the list of SP URLs
 * that were requested.
 */
const stubFetch = ({
  findPieceStatus = 200,
  dataSets = [] as { dataSetId: bigint; pdpEndEpoch: bigint }[],
  dataSetResponses = {} as Record<
    string,
    { status: number; pieces?: { pieceCid: string; subPieceCid: string }[] }
  >,
}) => {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    // ox's RpcTransport calls fetch with a single Request object.
    const url = input instanceof Request ? input.url : input.toString()

    if (input instanceof Request && input.method === 'POST') {
      const body = JSON.parse(await input.text())
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: encodeDataSets(dataSets),
      })
    }

    calls.push(url)

    if (url.includes('/pdp/piece?'))
      return new Response(
        findPieceStatus === 200 ? JSON.stringify({ pieceCid: PIECE_CID }) : '',
        { status: findPieceStatus },
      )

    const dataSetId = url.match(/\/pdp\/data-sets\/(\d+)/)?.[1]
    if (dataSetId && dataSetResponses[dataSetId]) {
      const { status, pieces } = dataSetResponses[dataSetId]
      return new Response(status === 200 ? JSON.stringify({ pieces }) : '', {
        status,
      })
    }

    return new Response('', { status: 404 })
  }) as typeof fetch

  return calls
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('statusOnFilecoin', () => {
  it('returns unknown without CAR bytes or an explicit piece CID', async () => {
    const calls = stubFetch({})

    expect(
      await statusOnFilecoin({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        auth: { token: randomPrivateKey() },
      }),
    ).toEqual({ pin: 'unknown' })
    expect(calls.length).toBe(0)
  })

  it('throws MissingKeyError without a token', async () => {
    stubFetch({})

    expect(
      statusOnFilecoin({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        auth: {},
        pieceCid: PIECE_CID,
      }),
    ).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('reports not pinned when the SP does not know the piece', async () => {
    const calls = stubFetch({ findPieceStatus: 404 })

    expect(
      await statusOnFilecoin({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        auth: { token: randomPrivateKey() },
        pieceCid: PIECE_CID,
        providerURL: SP_URL,
      }),
    ).toEqual({ pin: 'not pinned' })
    expect(calls).toEqual([`${SP_URL}/pdp/piece?pieceCid=${PIECE_CID}`])
  })

  it('reports pinned when the piece sits in an active client data set', async () => {
    stubFetch({
      dataSets: [{ dataSetId: 42n, pdpEndEpoch: 0n }],
      dataSetResponses: {
        42: {
          status: 200,
          pieces: [{ pieceCid: PIECE_CID, subPieceCid: PIECE_CID }],
        },
      },
    })

    expect(
      await statusOnFilecoin({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        auth: { token: randomPrivateKey() },
        pieceCid: PIECE_CID,
        providerURL: SP_URL,
      }),
    ).toEqual({ pin: 'pinned' })
  })

  it('reports not pinned when the piece exists on the SP but only in a foreign deal', async () => {
    stubFetch({
      dataSets: [{ dataSetId: 42n, pdpEndEpoch: 0n }],
      dataSetResponses: {
        42: {
          status: 200,
          pieces: [{ pieceCid: OTHER_PIECE_CID, subPieceCid: OTHER_PIECE_CID }],
        },
      },
    })

    expect(
      await statusOnFilecoin({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        auth: { token: randomPrivateKey() },
        pieceCid: PIECE_CID,
        providerURL: SP_URL,
      }),
    ).toEqual({ pin: 'not pinned' })
  })

  it('ignores ended data sets and unreadable data sets', async () => {
    // Data set 41 is ended (pdpEndEpoch != 0) and 42 is behind auth: neither
    // may produce a 'pinned'.
    stubFetch({
      dataSets: [
        { dataSetId: 41n, pdpEndEpoch: 123n },
        { dataSetId: 42n, pdpEndEpoch: 0n },
      ],
      dataSetResponses: {
        41: {
          status: 200,
          pieces: [{ pieceCid: PIECE_CID, subPieceCid: PIECE_CID }],
        },
        42: { status: 401 },
      },
    })

    expect(
      await statusOnFilecoin({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        auth: { token: randomPrivateKey() },
        pieceCid: PIECE_CID,
        providerURL: SP_URL,
      }),
    ).toEqual({ pin: 'not pinned' })
  })

  it('derives the piece CID from CAR bytes', async () => {
    const calls = stubFetch({ findPieceStatus: 404 })

    expect(
      await statusOnFilecoin({
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        auth: { token: randomPrivateKey() },
        bytes: new Uint8Array(1024).fill(7) as Uint8Array<ArrayBuffer>,
        providerURL: SP_URL,
      }),
    ).toEqual({ pin: 'not pinned' })
    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('/pdp/piece?pieceCid=bafkzcib')
  })
})
