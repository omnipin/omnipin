import net from 'node:net'
import { join } from 'node:path'

export type DaemonFrame = Record<string, unknown>

/** Encode a payload the way the daemon does: u32-LE length + JSON. */
export const encodeFrame = (payload: DaemonFrame): Buffer => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(body.length, 0)
  return Buffer.concat([header, body])
}

/**
 * A stand-in for `hoverfly daemon`: reads one request frame and replies with
 * the frames the test asks for. An empty reply list closes the connection.
 */
export const startFakeDaemon = async (
  reply: (request: DaemonFrame) => Buffer[],
): Promise<{
  path: string
  requests: DaemonFrame[]
  close: () => Promise<void>
}> => {
  // UNIX socket paths are length-limited (~104 bytes on macOS), so keep the
  // name short instead of using the long per-user temp dir.
  const path = join(
    '/tmp',
    `omnipin-hf-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`,
  )
  const requests: DaemonFrame[] = []

  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length < 4) return
      const length = buffer.readUInt32LE(0)
      if (buffer.length < 4 + length) return
      const request = JSON.parse(
        buffer.subarray(4, 4 + length).toString('utf8'),
      ) as DaemonFrame
      requests.push(request)
      const frames = reply(request)
      if (frames.length === 0) {
        // No reply — close the connection so the client sees the EOF.
        socket.end()
        return
      }
      for (const payload of frames) socket.write(payload)
    })
  })

  await new Promise<void>((resolve) => server.listen(path, resolve))

  return {
    path,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}
