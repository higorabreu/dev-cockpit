import { connect } from 'node:net'
import { isAbsolute, join } from 'node:path'
import type { SystemScreen } from '../../electron/screen.ts'

export interface Size {
  readonly width: number
  readonly height: number
}

// The socket of the session's compositor, as libwayland finds it
export function waylandSocket(env: Readonly<Record<string, string | undefined>>): string {
  const name = env.WAYLAND_DISPLAY || 'wayland-0'
  return isAbsolute(name) ? name : join(env.XDG_RUNTIME_DIR ?? '', name)
}

// Object ids this client creates, in order; wl_display is always 1
const DISPLAY = 1
const REGISTRY = 2
const SYNC = 3
const COMPOSITOR = 4
const WM_BASE = 5
const SURFACE = 6
const XDG_SURFACE = 7
const TOPLEVEL = 8

// xdg_toplevel.configure_bounds arrived in xdg_wm_base version 4
const BOUNDS_VERSION = 4

const pad = (length: number) => (length + 3) & ~3

const uint = (value: number) => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

const text = (value: string) => {
  const bytes = Buffer.from(`${value}\0`, 'utf8')
  const buffer = Buffer.alloc(4 + pad(bytes.length))
  buffer.writeUInt32LE(bytes.length)
  bytes.copy(buffer, 4)
  return buffer
}

export function request(object: number, opcode: number, ...args: Buffer[]): Buffer {
  const body = Buffer.concat(args)
  const header = Buffer.alloc(8)
  header.writeUInt32LE(object)
  header.writeUInt32LE(((8 + body.length) << 16) | opcode, 4)
  return Buffer.concat([header, body])
}

const readText = (body: Buffer, offset: number) => {
  const length = body.readUInt32LE(offset)
  return {
    value: body.toString('utf8', offset + 4, offset + 4 + Math.max(0, length - 1)),
    next: offset + 4 + pad(length),
  }
}

// Asks the compositor how large a window opened now may be: Mutter and KWin answer with the work area of
// the monitor it would open on (xdg_toplevel.configure_bounds). The surface gets no buffer, so it is never
// mapped and nothing shows on screen. Undefined when the compositor does not say in time
export function readWaylandBounds(
  socketPath: string,
  timeoutMs: number,
): Promise<Size | undefined> {
  return new Promise((resolve) => {
    const socket = connect(socketPath)
    const globals = new Map<string, { name: number; version: number }>()
    let pending = Buffer.alloc(0)
    let bounds: Size | undefined
    let settled = false

    const finish = (result: Size | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!socket.destroyed) {
        socket.end(
          Buffer.concat([
            request(TOPLEVEL, 0),
            request(XDG_SURFACE, 0),
            request(SURFACE, 0),
            request(WM_BASE, 0),
          ]),
        )
      }
      resolve(result)
    }
    const timer = setTimeout(() => {
      socket.destroy()
      finish(undefined)
    }, timeoutMs)

    function bind(name: string, id: number, version: number): boolean {
      const global = globals.get(name)
      if (!global || global.version < version) return false
      socket.write(request(REGISTRY, 0, uint(global.name), text(name), uint(version), uint(id)))
      return true
    }

    function onGlobals() {
      if (!bind('wl_compositor', COMPOSITOR, 1) || !bind('xdg_wm_base', WM_BASE, BOUNDS_VERSION)) {
        return finish(undefined)
      }
      socket.write(
        Buffer.concat([
          request(COMPOSITOR, 0, uint(SURFACE)),
          request(WM_BASE, 2, uint(XDG_SURFACE), uint(SURFACE)),
          request(XDG_SURFACE, 1, uint(TOPLEVEL)),
          request(SURFACE, 6),
        ]),
      )
    }

    function onEvent(object: number, opcode: number, body: Buffer) {
      if (object === DISPLAY && opcode === 0) return finish(undefined)
      if (object === REGISTRY && opcode === 0) {
        const name = body.readUInt32LE(0)
        const iface = readText(body, 4)
        globals.set(iface.value, { name, version: body.readUInt32LE(iface.next) })
        return
      }
      if (object === SYNC && opcode === 0) return onGlobals()
      if (object === WM_BASE && opcode === 0) {
        socket.write(request(WM_BASE, 3, uint(body.readUInt32LE(0))))
        return
      }
      if (object === TOPLEVEL && opcode === 2) {
        const width = body.readInt32LE(0)
        const height = body.readInt32LE(4)
        // Zero means the compositor has no bound to give
        bounds = width > 0 && height > 0 ? { width, height } : undefined
        return
      }
      // The first configure closes the burst that carries the bounds
      if (object === XDG_SURFACE && opcode === 0) finish(bounds)
    }

    socket.on('connect', () => {
      socket.write(
        Buffer.concat([request(DISPLAY, 1, uint(REGISTRY)), request(DISPLAY, 0, uint(SYNC))]),
      )
    })
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk])
      while (pending.length >= 8) {
        const size = pending.readUInt32LE(4) >>> 16
        if (size < 8 || pending.length < size) break
        onEvent(
          pending.readUInt32LE(0),
          pending.readUInt32LE(4) & 0xffff,
          pending.subarray(8, size),
        )
        pending = pending.subarray(size)
      }
    })
    socket.on('error', () => finish(undefined))
    socket.on('close', () => finish(undefined))
  })
}

// Under native Wayland the pointer reads 0,0 and a requested position is ignored: the window takes the
// size the compositor gave and the compositor puts it on the pointer's monitor
export function boundedScreen(screen: SystemScreen, area: () => Size | undefined): SystemScreen {
  return {
    cursorPoint: () => screen.cursorPoint(),
    displayNearest(point) {
      const size = area()
      const display = screen.displayNearest(point)
      if (!size) return display
      const rectangle = { x: 0, y: 0, ...size }
      // The compositor gives no scale with the size; the monitor's, as Electron reads it, keeps the
      // window's height on whole device pixels
      return {
        id: 'wayland',
        bounds: rectangle,
        workArea: rectangle,
        scaleFactor: display.scaleFactor,
        source: 'wayland',
      }
    },
  }
}

export interface WaylandArea {
  // The last size the compositor gave, if it ever answered
  current(): Size | undefined
  // Asks again; a compositor that does not answer in time leaves the last size in place
  refresh(): Promise<void>
}

export function createWaylandArea(read: () => Promise<Size | undefined>): WaylandArea {
  let current: Size | undefined
  return {
    current: () => current,
    async refresh() {
      const area = await read()
      if (area) current = area
    },
  }
}
