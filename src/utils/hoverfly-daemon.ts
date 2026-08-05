import net from 'node:net'

// Client for the `hoverfly daemon` UNIX-socket IPC: one framed message
// (u32-LE length prefix + JSON body) per direction, per connection.

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

export type HoverflyResponse =
  | { status: 'pong' }
  | { status: 'uploaded'; root: string; bytes: number }
  | { status: 'fetched'; bytes_written: number; content_type: string | null }
  | { status: 'ok' }
  | { status: 'err'; message: string }

const MAX_FRAME = 1 << 20

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
