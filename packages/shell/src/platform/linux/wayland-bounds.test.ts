import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readWaylandBounds, request, waylandSocket } from './wayland-bounds.ts'

const uint = (value: number) => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

const text = (value: string) => {
  const bytes = Buffer.from(`${value}\0`)
  const buffer = Buffer.alloc(4 + ((bytes.length + 3) & ~3))
  buffer.writeUInt32LE(bytes.length)
  bytes.copy(buffer, 4)
  return buffer
}

interface FakeCompositor {
  readonly wmBaseVersion: number
  readonly bounds?: { width: number; height: number }
  readonly silent?: boolean
}

// A compositor that answers the registry, then the toplevel's first configure, as Mutter does
function startCompositor(options: FakeCompositor) {
  const folder = mkdtempSync(join(tmpdir(), 'dck-wayland-'))
  const path = join(folder, 'wayland-0')
  const requests: string[] = []
  const server: Server = createServer((socket) => {
    let pending = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk])
      while (pending.length >= 8) {
        const size = pending.readUInt32LE(4) >>> 16
        if (pending.length < size) break
        const object = pending.readUInt32LE(0)
        const opcode = pending.readUInt32LE(4) & 0xffff
        const first = pending.length >= 12 ? pending.readUInt32LE(8) : 0
        requests.push(`${object}.${opcode}`)
        pending = pending.subarray(size)
        if (options.silent) continue
        if (object === 1 && opcode === 1) {
          socket.write(request(first, 0, uint(1), text('wl_compositor'), uint(6)))
          socket.write(request(first, 0, uint(2), text('xdg_wm_base'), uint(options.wmBaseVersion)))
        }
        if (object === 1 && opcode === 0) socket.write(request(first, 0, uint(0)))
        if (object === 6 && opcode === 6) {
          if (options.bounds) {
            socket.write(request(8, 2, uint(options.bounds.width), uint(options.bounds.height)))
          }
          socket.write(request(8, 0, uint(0), uint(0), uint(0)))
          socket.write(request(7, 0, uint(42)))
        }
      }
    })
  })
  server.listen(path)
  return {
    path,
    requests,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    folder,
  }
}

let cleanup: (() => Promise<void>) | undefined

afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
})

function compositor(options: FakeCompositor) {
  const fake = startCompositor(options)
  cleanup = async () => {
    await fake.stop()
    rmSync(fake.folder, { recursive: true, force: true })
  }
  return fake
}

// The fake compositor listens on a Unix socket, which Windows' net module does not offer
describe.skipIf(process.platform === 'win32')('readWaylandBounds', () => {
  it('should return the work area the compositor gives when a window would open now', async () => {
    const fake = compositor({ wmBaseVersion: 6, bounds: { width: 1280, height: 737 } })

    const bounds = await readWaylandBounds(fake.path, 1000)

    expect(bounds).toEqual({ width: 1280, height: 737 })
  })

  it('should never give the surface a buffer when it asks, so nothing is mapped', async () => {
    const fake = compositor({ wmBaseVersion: 6, bounds: { width: 1920, height: 1017 } })

    await readWaylandBounds(fake.path, 1000)

    expect(fake.requests).not.toContain('6.1')
    expect(fake.requests).toContain('6.6')
  })

  it('should give no bounds when the compositor predates configure_bounds', async () => {
    const fake = compositor({ wmBaseVersion: 3 })

    const bounds = await readWaylandBounds(fake.path, 1000)

    expect(bounds).toBeUndefined()
  })

  it('should give no bounds when the compositor sends none before the first configure', async () => {
    const fake = compositor({ wmBaseVersion: 6 })

    const bounds = await readWaylandBounds(fake.path, 1000)

    expect(bounds).toBeUndefined()
  })

  it('should give up when the compositor does not answer in time', async () => {
    const fake = compositor({ wmBaseVersion: 6, silent: true })

    const bounds = await readWaylandBounds(fake.path, 50)

    expect(bounds).toBeUndefined()
  })

  it('should give no bounds when no compositor listens on the socket', async () => {
    const bounds = await readWaylandBounds(join(tmpdir(), 'dck-no-wayland', 'wayland-0'), 200)

    expect(bounds).toBeUndefined()
  })
})

describe('waylandSocket', () => {
  it('should find the socket in the runtime folder when WAYLAND_DISPLAY is a name', () => {
    expect(waylandSocket({ WAYLAND_DISPLAY: 'wayland-1', XDG_RUNTIME_DIR: '/run/user/1000' })).toBe(
      '/run/user/1000/wayland-1',
    )
  })

  it('should use WAYLAND_DISPLAY as is when it is an absolute path', () => {
    expect(waylandSocket({ WAYLAND_DISPLAY: '/tmp/wl', XDG_RUNTIME_DIR: '/run/user/1000' })).toBe(
      '/tmp/wl',
    )
  })

  it('should fall back to wayland-0 when WAYLAND_DISPLAY is not set', () => {
    expect(waylandSocket({ XDG_RUNTIME_DIR: '/run/user/1000' })).toBe('/run/user/1000/wayland-0')
  })
})
