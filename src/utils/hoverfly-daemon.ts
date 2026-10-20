import net from 'node:net'

// Client for the `hoverfly daemon` UNIX-socket IPC: framed messages
// (u32-LE length prefix + JSON body). A request opens a connection and
// sends one request frame; the daemon replies with one or more response
// frames — an upload with `progress: true` streams `progress` frames
// before the terminal `uploaded` / `err` frame.

export type HoverflyRequest =
  | { op: 'ping' }
  | {
      op: 'upload'
      file: string
      batch: string
      depth: number
      /** Fill-only stamping (immutable batches) vs overwrite-aware ring
       * stamping (mutable batches). Defaults to `false` server-side. */
      immutable?: boolean
      key: string
      /** Overlay nonce (hex, 32 bytes) for the upload signer. The overlay is
       * `keccak256(eth_addr || network_id || nonce)`, so the same nonce on
       * every upload keeps the overlay stable — what bee's kademlia memory
       * needs to route back to us later. Omitted means the daemon derives a
       * fresh random overlay per upload. */
      nonce?: string | null
      max_retries: number
      concurrency: number
      raw: boolean
      collection: boolean
      /** Ask the daemon to stream `progress` frames while uploading. */
      progress?: boolean
      manifest_path: string | null
      content_type: string | null
      index_document: string | null
      error_document: string | null
      /** Reed–Solomon redundancy level (`none`|`medium`|`strong`|`insane`|
       * `paranoid`). Omitted means the daemon's default (`medium`). */
      redundancy?: string | null
    }
  | { op: 'reload_peers' }
  | { op: 'save_peers' }
  | { op: 'shutdown' }

export type HoverflyResponse =
  | { status: 'pong' }
  | { status: 'progress'; done: number; total: number }
  | { status: 'uploaded'; root: string; bytes: number }
  | { status: 'ok' }
  | { status: 'err'; message: string }

const MAX_FRAME = 1 << 20

/**
 * Call the daemon over its UNIX socket.
 *
 * @param socketPath - Path of the daemon socket.
 * @param request - Request frame payload.
 * @param onProgress - Called for every `progress` frame (upload only).
 */
export const callDaemon = (
  socketPath: string,
  request: HoverflyRequest,
  onProgress?: (done: number, total: number) => void,
): Promise<HoverflyResponse> =>
  new Promise((resolve, reject) => {
    const sock = net.createConnection({ path: socketPath })
    let buffer: Buffer = Buffer.alloc(0)
    let expected = -1
    let settled = false

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      sock.destroy()
      reject(error)
    }

    sock.on('connect', () => {
      const body = Buffer.from(JSON.stringify(request), 'utf8')
      const header = Buffer.allocUnsafe(4)
      header.writeUInt32LE(body.length, 0)
      sock.write(Buffer.concat([header, body]))
    })

    sock.on('data', (chunk: Buffer) => {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk
      // A single `data` event can carry several frames, and one frame can
      // be split across events — so drain the buffer in a loop.
      for (;;) {
        if (expected < 0) {
          if (buffer.length < 4) return
          expected = buffer.readUInt32LE(0)
          if (expected > MAX_FRAME) {
            fail(new Error(`daemon frame too large: ${expected}`))
            return
          }
        }
        if (buffer.length < 4 + expected) return

        const body = buffer.subarray(4, 4 + expected).toString('utf8')
        buffer = buffer.subarray(4 + expected)
        expected = -1

        let response: HoverflyResponse
        try {
          response = JSON.parse(body) as HoverflyResponse
        } catch {
          fail(new Error(`invalid daemon response: ${body}`))
          return
        }

        // `progress` frames are streamed before the terminal frame.
        if (response.status === 'progress') {
          try {
            onProgress?.(response.done, response.total)
          } catch (e) {
            fail(e as Error)
            return
          }
          continue
        }

        settled = true
        sock.end()
        resolve(response)
        return
      }
    })

    sock.on('error', fail)
    sock.on('end', () => {
      if (!settled) fail(new Error('daemon closed connection early'))
    })
  })

export const DEFAULT_HOVERFLY_SOCKET = '/tmp/hoverfly.sock'
