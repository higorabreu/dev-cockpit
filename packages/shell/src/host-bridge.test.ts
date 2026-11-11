import { hostChannels, silentLogger, type TabNotification } from '@dck/core'
import { FakePtyHost, MemoryClipboard } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { type IpcMainApi, registerHostBridge } from './host-bridge.ts'

function setup() {
  const handlers = new Map<string, (...args: never[]) => unknown>()
  const ipcMain: IpcMainApi = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    on: (channel, listener) => void handlers.set(channel, listener),
  }
  const ptyHost = new FakePtyHost()
  const clipboard = new MemoryClipboard('conteúdo')
  const sent: Array<[string, ...unknown[]]> = []
  let fullHeightToggles = 0
  const touched: string[] = []
  const notified: TabNotification[] = []
  const bridge = registerHostBridge({
    ipcMain,
    ptyHost,
    clipboard,
    sessions: {
      activity: async (pid: number) => ({
        cwd: `/pid/${pid}`,
        process: 'zsh',
        activity: 'idle' as const,
      }),
      snapshot: async (pid: number) => ({
        cwd: `/pid/${pid}`,
        process: 'zsh',
        activity: 'idle' as const,
      }),
    },
    environment: {
      status: async (pid: number) => ({ kind: 'ok' as const, project: `p${pid}`, containers: [] }),
    },
    notifier: { notify: (notification) => void notified.push(notification) },
    projects: {
      list: async () => [{ name: 'alpha', path: '/p/alpha' }],
      touch: async (path: string) => void touched.push(path),
      toggleFavorite: async (path: string) => !path.endsWith('/pinned'),
    },
    shell: '/bin/zsh',
    home: '/home/usuario',
    logger: silentLogger,
    send: (channel, ...args) => sent.push([channel, ...args]),
    toggleFullHeight: () => {
      fullHeightToggles += 1
    },
  })
  const call = (channel: string, ...args: unknown[]) =>
    (handlers.get(channel) as (...a: unknown[]) => unknown)({}, ...args)
  return {
    ptyHost,
    clipboard,
    sent,
    call,
    bridge,
    touched,
    notified,
    fullHeights: () => fullHeightToggles,
  }
}

describe('registerHostBridge pty', () => {
  it('should create a session in the home directory when no directory is given', async () => {
    const { call, ptyHost } = setup()

    const id = await call(hostChannels.ptyCreate, { cols: 100, rows: 30 })

    expect(id).toBe(1)
    expect(ptyHost.sessions).toHaveLength(1)
    expect(ptyHost.sessions[0]?.size).toEqual({ cols: 100, rows: 30 })
  })

  it('should forward the process output to the interface when the session prints', async () => {
    const { call, ptyHost, sent } = setup()
    await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    ptyHost.sessions[0]?.emitData('olá')

    expect(sent).toContainEqual([hostChannels.ptyData, 1, 'olá'])
  })

  it('should write typed input to the right session when the interface sends input', async () => {
    const { call, ptyHost } = setup()
    await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })
    await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    call(hostChannels.ptyWrite, 2, 'ls\n')

    expect(ptyHost.sessions[0]?.written).toEqual([])
    expect(ptyHost.sessions[1]?.written).toEqual(['ls\n'])
  })

  it('should resize the session when the interface reports a new size', async () => {
    const { call, ptyHost } = setup()
    await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    call(hostChannels.ptyResize, 1, 120, 40)

    expect(ptyHost.sessions[0]?.size).toEqual({ cols: 120, rows: 40 })
  })

  it('should notify the interface and forget the session when the process exits', async () => {
    const { call, ptyHost, sent } = setup()
    await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    ptyHost.sessions[0]?.emitExit({ code: 0, signal: null })
    call(hostChannels.ptyWrite, 1, 'tarde demais')

    expect(sent).toContainEqual([hostChannels.ptyExit, 1, { code: 0, signal: null }])
    expect(ptyHost.sessions[0]?.written).toEqual([])
  })

  it('should kill every session when the bridge is shut down', async () => {
    const { call, ptyHost, bridge } = setup()
    await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })
    await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    bridge.killAll()

    expect(ptyHost.sessions.every((session) => session.killed)).toBe(true)
  })
})

describe('registerHostBridge clipboard and window', () => {
  it('should read and write the clipboard through the port when the interface asks', async () => {
    const { call, clipboard } = setup()

    await call(hostChannels.clipboardWrite, 'novo')
    const text = await call(hostChannels.clipboardRead)

    expect(clipboard.text).toBe('novo')
    expect(text).toBe('novo')
  })

  it('should ask for the full height toggle when the interface requests it', () => {
    const { call, fullHeights } = setup()

    call(hostChannels.windowToggleFullHeight)

    expect(fullHeights()).toBe(1)
  })

  it('should return the catalog projects when the interface lists projects', async () => {
    const { call } = setup()

    const projects = await call(hostChannels.projectsList)

    expect(projects).toEqual([{ name: 'alpha', path: '/p/alpha' }])
  })

  it('should record the project as recently used when the interface touches it', () => {
    const { call, touched } = setup()

    call(hostChannels.projectsTouch, '/p/alpha')

    expect(touched).toEqual(['/p/alpha'])
  })

  it('should inspect the process of the session when the interface asks for it', async () => {
    const { call, ptyHost } = setup()
    const id = await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    const snapshot = await call(hostChannels.sessionInspect, id)

    expect(snapshot).toEqual({
      cwd: `/pid/${ptyHost.sessions[0]?.pid}`,
      process: 'zsh',
      activity: 'idle',
    })
  })

  it('should return nothing when the session does not exist', async () => {
    const { call } = setup()

    expect(await call(hostChannels.sessionInspect, 99)).toBeUndefined()
  })

  it('should return the light activity of the session when the interface asks for it', async () => {
    const { call, ptyHost } = setup()
    const id = await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    const info = await call(hostChannels.sessionActivity, id)

    expect(info).toEqual({
      cwd: `/pid/${ptyHost.sessions[0]?.pid}`,
      process: 'zsh',
      activity: 'idle',
    })
  })

  it('should pass a valid notification request to the notifier when the interface asks', () => {
    const { call, notified } = setup()

    call(hostChannels.notificationsShow, { title: 'Dev Cockpit', body: 'terminou', tabId: 'tab-2' })

    expect(notified).toEqual([{ title: 'Dev Cockpit', body: 'terminou', tabId: 'tab-2' }])
  })

  it('should ignore a malformed notification request when the payload is not valid', () => {
    const { call, notified } = setup()

    call(hostChannels.notificationsShow, { title: 42 })

    expect(notified).toEqual([])
  })

  it('should read the environment of the session when the interface asks for it', async () => {
    const { call, ptyHost } = setup()
    const id = await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    const status = await call(hostChannels.environmentInspect, id)

    expect(status).toEqual({ kind: 'ok', project: `p${ptyHost.sessions[0]?.pid}`, containers: [] })
  })

  it('should report none when the session does not exist and the environment is asked', async () => {
    const { call } = setup()

    expect(await call(hostChannels.environmentInspect, 99)).toEqual({ kind: 'none' })
  })

  it('should give every terminal its own id in the environment when it is created', async () => {
    const { call, ptyHost } = setup()

    const first = await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })
    const second = await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    expect(ptyHost.sessions[0]?.env.DCK_PTY_ID).toBe(String(first))
    expect(ptyHost.sessions[1]?.env.DCK_PTY_ID).toBe(String(second))
  })

  it('should return the new favorite state when the interface toggles a project', async () => {
    const { call } = setup()

    expect(await call(hostChannels.projectsToggleFavorite, '/p/alpha')).toBe(true)
    expect(await call(hostChannels.projectsToggleFavorite, '/p/pinned')).toBe(false)
  })
})
