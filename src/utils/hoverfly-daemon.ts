import net from 'node:net'

/**
 * Minimal client for the `hoverfly daemon` UNIX-socket IPC.
 *
 * Wire protocol (see hoverfly's src/daemon.rs): each request opens a fresh
 * connection and exchanges exactly one framed message in each direction. A
 * frame is a little-endian `u32` length prefix followed by a JSON body. The
 * daemon owns the long-lived warm session pool and the node identity/overlay,
 * so the client just hands it a request and reads the reply.
 */

/** `op`-tagged request union (serde `#[serde(tag = "op")]`). */
export type HoverflyRequest =
  | { op: 'ping' }
  | {
      op: 'upload'
      file: string
      batch: string
      depth: number
      key: string
      max_retries: number
      concurrency: number
      raw: boolean
      collection: boolean
      manifest_path: string | null
      content_type: string | null
      index_document: string | null
      error_document: string | null
    }
  | { op: 'reload_peers' }
  | { op: 'save_peers' }
  | { op: 'shutdown' }

/** `status`-tagged response union (serde `#[serde(tag = "status")]`). */
export type HoverflyResponse =
  | { status: 'pong' }
  | { status: 'uploaded'; root: string; bytes: number }
  | { status: 'fetched'; bytes_written: number; content_type: string | null }
  | { status: 'ok' }
  | { status: 'err'; message: string }

const MAX_FRAME = 1 << 20 // 1 MiB, matches the daemon's MAX_FRAME

/**
 * Send one request to the daemon at `socketPath` and resolve its response.
 * Rejects if the socket is missing/unreachable (daemon not running) or the
 * response frame is malformed.
 */
export const callDaemon = (
  socketPath: string,
  request: HoverflyRequest,
): Promise<HoverflyResponse> =>
  new Promise((resolve, reject) => {
    const sock = net.createConnection({ path: socketPath })
    const chunks: Buffer[] = []
    let expected = -1

    sock.on('connect', () => {
      const body = Buffer.from(JSON.stringify(request), 'utf8')
      const header = Buffer.allocUnsafe(4)
      header.writeUInt32LE(body.length, 0)
      sock.write(Buffer.concat([header, body]))
    })

    sock.on('data', (d: Buffer) => {
      chunks.push(d)
      const buf = Buffer.concat(chunks)
      if (expected < 0 && buf.length >= 4) {
        expected = buf.readUInt32LE(0)
        if (expected > MAX_FRAME) {
          sock.destroy()
          reject(new Error(`daemon frame too large: ${expected}`))
          return
        }
      }
      if (expected >= 0 && buf.length >= 4 + expected) {
        sock.end()
        try {
          resolve(JSON.parse(buf.subarray(4, 4 + expected).toString('utf8')))
        } catch (e) {
          reject(e as Error)
        }
      }
    })

    sock.on('error', reject)
    sock.on('end', () => {
      if (expected < 0) reject(new Error('daemon closed connection early'))
    })
  })

export const DEFAULT_HOVERFLY_SOCKET = '/tmp/hoverfly.sock'
