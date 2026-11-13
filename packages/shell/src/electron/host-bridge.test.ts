import {
  type ConnectionFields,
  type Connector,
  type DiffRequest,
  defaultSettings,
  GITLAB_CONNECTOR,
  hostChannels,
  type LogContext,
  ok,
  reviewDiff,
  type TabNotification,
} from '@dck/core'
import { FakePtyHost, MemoryClipboard } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { type IpcMainApi, registerHostBridge } from './host-bridge.ts'

interface DiskEntry {
  readonly kind: 'file' | 'dir'
  readonly mode: number
  // Where a symbolic link points
  readonly real?: string
}

const file = (mode = 0o644): DiskEntry => ({ kind: 'file', mode })
const dir: DiskEntry = { kind: 'dir', mode: 0o755 }

const disk = new Map<string, DiskEntry>([
  ['/home/usuario', dir],
  ['/home/usuario/notes.md', file()],
  ['/srv/acme/backend', dir],
  ['/srv/acme/backend/src', dir],
  ['/srv/acme/backend/src/app.ts', file()],
  ['/srv/acme/backend/build', file(0o755)],
  ['/srv/acme/backend/only-group-runs', file(0o650)],
  ['/srv/acme/backend/launcher.desktop', file()],
  ['/srv/acme/backend/Tool.AppImage', file()],
  ['/srv/acme/backend/deploy.sh', file()],
  ['/srv/acme/backend/README.txt', { ...file(), real: '/srv/acme/backend/launcher.desktop' }],
  ['/srv/acme/backend/Bundle.app', dir],
])

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
  let autostartOn = false
  const notified: TabNotification[] = []
  const connects: { id: string; fields: ConnectionFields; token: string }[] = []
  let connectors: readonly Connector[] = [GITLAB_CONNECTOR]
  const viewRefreshes: { view: string; maxAgeMs: number | undefined }[] = []
  const opened: string[] = []
  const warnings: { message: string; context: LogContext | undefined }[] = []
  const openedPaths: string[] = []
  const shownPaths: string[] = []
  const diffRequests: DiffRequest[] = []
  const fileReads: string[] = []
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
    agents: [{ id: 'acme', name: 'Acme Agent', processes: ['acme'] }],
    environment: {
      status: async (pid: number) => ({ kind: 'ok' as const, project: `p${pid}`, containers: [] }),
    },
    files: {
      stat: async (path) => {
        const entry = disk.get(path)
        if (!entry) throw new Error('ENOENT')
        return {
          mode: entry.mode,
          isFile: () => entry.kind === 'file',
          isDirectory: () => entry.kind === 'dir',
        }
      },
      realpath: async (path) => disk.get(path)?.real ?? path,
      openPath: async (path) => {
        openedPaths.push(path)
        return ''
      },
      showItemInFolder: (path) => void shownPaths.push(path),
    },
    review: {
      diff: async (request) => {
        diffRequests.push(request)
        return ok({
          kind: 'ok' as const,
          diff: reviewDiff('/srv/acme/backend', request.scope, undefined, []),
        })
      },
      fileLines: async (root, path) => {
        fileReads.push(`${root}|${path}`)
        return ok(['one'])
      },
    },
    settings: {
      get: () => ({ settings: defaultSettings, locked: [], fresh: true }),
      update: async (patch) => ({
        settings: { ...defaultSettings, theme: (patch as { theme?: 'light' }).theme ?? 'dark' },
        locked: [],
        fresh: false,
        rejected: [],
      }),
    },
    autostart: {
      isEnabled: async () => autostartOn,
      setEnabled: async (enabled) => {
        autostartOn = enabled
      },
    },
    connections: {
      list: () => connectors,
      disabled: () =>
        connectors.length === 0 ? [{ extension: 'dck.gitlab', id: 'gitlab', name: 'GitLab' }] : [],
      status: async () => ({ kind: 'none' as const }),
      connect: async (id, fields, token) => {
        connects.push({ id, fields, token })
        return { kind: 'none' as const }
      },
      disconnect: async () => ({ kind: 'none' as const }),
    },
    views: {
      snapshot: async (view) => ({
        view,
        items: [],
        updatedAt: 1,
        state: 'idle' as const,
        error: undefined,
      }),
      refresh: async (view, maxAgeMs) => {
        viewRefreshes.push({ view, maxAgeMs })
        return { view, items: [], updatedAt: 2, state: 'idle' as const, error: undefined }
      },
      configure: async () => undefined,
      parse: () => undefined,
    },
    external: {
      open: (url) => void opened.push(url),
      allowedOrigins: () => ['https://gl.test'],
    },
    notifier: { notify: (notification) => void notified.push(notification) },
    projects: {
      list: async () => [{ name: 'alpha', path: '/p/alpha' }],
      touch: async (path: string) => void touched.push(path),
      toggleFavorite: async (path: string) => !path.endsWith('/pinned'),
    },
    shell: { file: '/bin/zsh', args: [] },
    home: '/home/usuario',
    logger: {
      info() {},
      warn: (message, context) => void warnings.push({ message, context }),
      error() {},
    },
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
    connects,
    disableConnectors: () => {
      connectors = []
    },
    viewRefreshes,
    opened,
    warnings,
    openedPaths,
    shownPaths,
    diffRequests,
    fileReads,
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

  it('should list the known agents when the interface asks for them', async () => {
    const { call } = setup()

    expect(await call(hostChannels.agentProfiles)).toEqual([
      { id: 'acme', name: 'Acme Agent', processes: ['acme'] },
    ])
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

  it('should return the current settings when the interface asks for them', async () => {
    const { call } = setup()

    expect(await call(hostChannels.settingsGet)).toMatchObject({ fresh: true, locked: [] })
  })

  it('should pass the patch to the store and return the result when the interface updates settings', async () => {
    const { call } = setup()

    const result = (await call(hostChannels.settingsUpdate, { theme: 'light' })) as {
      settings: { theme: string }
    }

    expect(result.settings.theme).toBe('light')
  })

  it('should refuse a patch that is not an object when the interface updates settings', () => {
    const { call } = setup()

    expect(() => call(hostChannels.settingsUpdate, 'oops')).toThrow()
  })

  it('should toggle the autostart and report the new state when the interface sets it', async () => {
    const { call } = setup()

    expect(await call(hostChannels.autostartSet, true)).toBe(true)
    expect(await call(hostChannels.autostartGet)).toBe(true)
    expect(await call(hostChannels.autostartSet, false)).toBe(false)
  })
})

describe('registerHostBridge connections', () => {
  it('should forward the connector, the address and the trimmed token when the request is valid', async () => {
    const { call, connects } = setup()

    await call(hostChannels.connectionsConnect, {
      id: 'gitlab',
      fields: { url: 'https://gl.test' },
      token: ' glpat-x ',
    })

    expect(connects).toEqual([
      { id: 'gitlab', fields: { url: 'https://gl.test' }, token: 'glpat-x' },
    ])
  })

  it.each([
    ['no token', { id: 'gitlab', fields: { url: 'https://gl.test' }, token: '  ' }],
    ['a payload that is not an object', 'glpat-x'],
    [
      'a token that is too long',
      { id: 'gitlab', fields: { url: 'https://gl.test' }, token: 'x'.repeat(513) },
    ],
    ['no connector', { fields: { url: 'https://gl.test' }, token: 'glpat-x' }],
    ['the address outside the fields', { id: 'gitlab', url: 'https://gl.test', token: 'glpat-x' }],
  ])('should refuse the request without connecting when it has %s', async (_label, payload) => {
    const { call, connects } = setup()

    const status = await call(hostChannels.connectionsConnect, payload)

    expect(status).toEqual({ kind: 'error', url: undefined, code: 'DCK-IPC-003' })
    expect(connects).toEqual([])
  })

  it('should list the enabled connectors when asked', async () => {
    const { call } = setup()

    expect(await call(hostChannels.connectionsList)).toEqual([GITLAB_CONNECTOR])
  })

  it('should list the disabled connectors when asked', async () => {
    const { call, disableConnectors } = setup()
    disableConnectors()

    expect(await call(hostChannels.connectionsDisabled)).toEqual([
      { extension: 'dck.gitlab', id: 'gitlab', name: 'GitLab' },
    ])
  })

  it('should answer none when the status asks for an id that is not text', async () => {
    const { call } = setup()

    expect(await call(hostChannels.connectionsStatus, 42)).toEqual({ kind: 'none' })
  })
})

describe('registerHostBridge views', () => {
  it('should return the snapshot of the view when the view is valid', async () => {
    const { call } = setup()

    expect(await call(hostChannels.viewsSnapshot, 'review')).toMatchObject({ view: 'review' })
  })

  it('should forward the view and the age limit when refreshing', async () => {
    const { call, viewRefreshes } = setup()

    await call(hostChannels.viewsRefresh, { view: 'mine', maxAgeMs: 30_000 })

    expect(viewRefreshes).toEqual([{ view: 'mine', maxAgeMs: 30_000 }])
  })

  it.each([
    ['an unknown view', { view: 'other' }],
    ['a negative age', { view: 'review', maxAgeMs: -5 }],
    ['not an object', 'review'],
  ])('should ignore the refresh when the request has %s', async (_label, payload) => {
    const { call, viewRefreshes } = setup()

    expect(await call(hostChannels.viewsRefresh, payload)).toBeUndefined()
    expect(viewRefreshes).toEqual([])
  })

  it('should not ask the daemon when the view belongs to a disabled connector', async () => {
    const { call, viewRefreshes, disableConnectors } = setup()
    disableConnectors()

    expect(await call(hostChannels.viewsSnapshot, 'review')).toBeUndefined()
    expect(await call(hostChannels.viewsRefresh, { view: 'review' })).toBeUndefined()
    expect(viewRefreshes).toEqual([])
  })
})

describe('registerHostBridge external', () => {
  it('should open the address when it belongs to a connected account', () => {
    const { call, opened } = setup()

    call(hostChannels.externalOpen, 'https://gl.test/g/p/-/merge_requests/5')

    expect(opened).toEqual(['https://gl.test/g/p/-/merge_requests/5'])
  })

  it.each([
    ['another host', 'https://evil.test/g/p'],
    ['a look alike host', 'https://gl.test.evil.test/x'],
    ['another protocol', 'file:///etc/passwd'],
    ['a plain http downgrade', 'http://gl.test/x'],
    ['text that is not an address', 'nada'],
    ['a value that is not text', 42],
  ])('should refuse to open %s when it is not the connected origin', (_label, url) => {
    const { call, opened } = setup()

    call(hostChannels.externalOpen, url)

    expect(opened).toEqual([])
  })
})

describe('registerHostBridge terminal links', () => {
  it.each([
    ['an https address', 'https://example.com/docs?q=1#top', 'https://example.com/docs?q=1#top'],
    ['an http address', 'http://localhost:5173/', 'http://localhost:5173/'],
    ['an address on any host', 'https://evil.test/x', 'https://evil.test/x'],
  ])('should open %s when the terminal asks to open a link', (_label, url, expected) => {
    const { call, opened } = setup()

    call(hostChannels.externalOpenLink, url)

    expect(opened).toEqual([expected])
  })

  it.each([
    ['a file address', 'file:///etc/passwd', 'file:'],
    ['a script address', 'javascript:alert(1)', 'javascript:'],
    ['a data address', 'data:text/html,<b>x</b>', 'data:'],
    ['a user and password', 'https://ana:secret@example.com/', 'https:'],
    ['only a user', 'https://ana@example.com/', 'https:'],
    ['an address that is too long', `https://example.com/${'a'.repeat(2048)}`, 'https:'],
    ['text that is not an address', 'nada', 'invalid'],
    ['a value that is not text', 42, 'invalid'],
  ])('should refuse and log only the scheme when the link has %s', (_label, url, scheme) => {
    const { call, opened, warnings } = setup()

    call(hostChannels.externalOpenLink, url)

    expect(opened).toEqual([])
    expect(warnings).toEqual([{ message: 'terminal link refused', context: { scheme } }])
  })

  it('should keep the GitLab only rule when the old channel gets any other address', () => {
    const { call, opened } = setup()

    call(hostChannels.externalOpen, 'https://example.com/docs')

    expect(opened).toEqual([])
  })
})

describe('registerHostBridge terminal paths', () => {
  const resolve = (call: (channel: string, ...args: unknown[]) => unknown, request: unknown) =>
    call(hostChannels.pathsResolve, request)

  it('should resolve each path against the base and the home folder when the request is valid', async () => {
    const { call } = setup()

    const resolved = await resolve(call, {
      base: '/srv/acme/backend',
      paths: [
        'src/app.ts',
        './src',
        '../backend/src/app.ts',
        '/home/usuario/notes.md',
        '~/notes.md',
      ],
    })

    expect(resolved).toEqual([
      { path: '/srv/acme/backend/src/app.ts', kind: 'file' },
      { path: '/srv/acme/backend/src', kind: 'dir' },
      { path: '/srv/acme/backend/src/app.ts', kind: 'file' },
      { path: '/home/usuario/notes.md', kind: 'file' },
      { path: '/home/usuario/notes.md', kind: 'file' },
    ])
  })

  it('should report a path as missing when it is not on disk', async () => {
    const { call } = setup()

    const resolved = await resolve(call, { base: '/srv/acme/backend', paths: ['src/gone.ts'] })

    expect(resolved).toEqual([{ path: '/srv/acme/backend/src/gone.ts', kind: 'missing' }])
  })

  it('should report a relative path as missing when the tab directory is unknown', async () => {
    const { call } = setup()

    const resolved = await resolve(call, { paths: ['src/app.ts', '/srv/acme/backend'] })

    expect(resolved).toEqual([
      { path: 'src/app.ts', kind: 'missing' },
      { path: '/srv/acme/backend', kind: 'dir' },
    ])
  })

  it.each([
    ['too many paths', { base: '/srv/acme/backend', paths: Array(51).fill('src/app.ts') }],
    ['a path that is too long', { base: '/srv/acme/backend', paths: [`a/${'b'.repeat(1024)}`] }],
    ['a relative base', { base: 'acme/backend', paths: ['src/app.ts'] }],
    ['a NUL in a path', { base: '/srv/acme/backend', paths: ['src/app.ts\0x'] }],
    ['an empty path', { base: '/srv/acme/backend', paths: [''] }],
    ['paths that are not text', { base: '/srv/acme/backend', paths: [42] }],
    ['a payload that is not an object', 'src/app.ts'],
  ])('should resolve nothing and log the kind when the request has %s', async (_label, request) => {
    const { call, warnings } = setup()

    const resolved = await resolve(call, request)

    expect(resolved).toEqual([])
    expect(warnings).toEqual([
      { message: 'terminal path request refused', context: { kind: 'resolve' } },
    ])
  })

  it('should open a plain file with the default app when the terminal asks to open it', async () => {
    const { call, openedPaths, shownPaths } = setup()

    await call(hostChannels.pathsOpenFile, '/srv/acme/backend/src/app.ts')

    expect(openedPaths).toEqual(['/srv/acme/backend/src/app.ts'])
    expect(shownPaths).toEqual([])
  })

  it.each([
    ['it has the execute bit', '/srv/acme/backend/build'],
    ['only its group may run it', '/srv/acme/backend/only-group-runs'],
    ['it is a desktop launcher', '/srv/acme/backend/launcher.desktop'],
    ['it is an AppImage', '/srv/acme/backend/Tool.AppImage'],
    ['it is a shell script', '/srv/acme/backend/deploy.sh'],
    ['its link points at a launcher', '/srv/acme/backend/README.txt'],
  ])('should only show the file in its folder when %s', async (_label, path) => {
    const { call, openedPaths, shownPaths } = setup()

    await call(hostChannels.pathsOpenFile, path)

    expect(openedPaths).toEqual([])
    expect(shownPaths).toEqual([path])
  })

  it('should open the folder in the file manager when the terminal asks to', async () => {
    const { call, openedPaths } = setup()

    await call(hostChannels.pathsOpenFolder, '/srv/acme/backend/src')

    expect(openedPaths).toEqual(['/srv/acme/backend/src'])
  })

  it('should only show an application bundle in its folder when it is a folder', async () => {
    const { call, openedPaths, shownPaths } = setup()

    await call(hostChannels.pathsOpenFolder, '/srv/acme/backend/Bundle.app')

    expect(openedPaths).toEqual([])
    expect(shownPaths).toEqual(['/srv/acme/backend/Bundle.app'])
  })

  it.each([
    ['a folder as a file', hostChannels.pathsOpenFile, '/srv/acme/backend/src', 'file', 'dir'],
    [
      'a file as a folder',
      hostChannels.pathsOpenFolder,
      '/srv/acme/backend/src/app.ts',
      'dir',
      'file',
    ],
    ['a missing file', hostChannels.pathsOpenFile, '/srv/acme/backend/gone.ts', 'file', 'missing'],
  ])(
    'should refuse and log only the kinds when asked to open %s',
    async (_label, channel, path, expected, kind) => {
      const { call, openedPaths, shownPaths, warnings } = setup()

      await call(channel, path)

      expect([...openedPaths, ...shownPaths]).toEqual([])
      expect(warnings).toEqual([{ message: 'terminal path refused', context: { expected, kind } }])
    },
  )

  it.each([
    ['a relative path', 'src/app.ts'],
    ['a value that is not text', 42],
    ['a path that is too long', `/srv/${'a'.repeat(4096)}`],
  ])('should refuse to open %s without logging it', async (_label, path) => {
    const { call, openedPaths, shownPaths, warnings } = setup()

    await call(hostChannels.pathsOpenFile, path)
    await call(hostChannels.pathsOpenFolder, path)

    expect([...openedPaths, ...shownPaths]).toEqual([])
    expect(warnings).toEqual([
      { message: 'terminal path request refused', context: { kind: 'file' } },
      { message: 'terminal path request refused', context: { kind: 'dir' } },
    ])
  })
})

describe('registerHostBridge review', () => {
  const request = (cwd: unknown, extra: Record<string, unknown> = {}) => ({
    cwd,
    scope: 'uncommitted',
    ignoreWhitespace: false,
    ...extra,
  })

  it('should read the diff of the folder when it is an absolute folder that exists', async () => {
    const { call, diffRequests } = setup()

    const result = await call(hostChannels.reviewDiff, request('/srv/acme/backend/src'))

    expect(result).toMatchObject({ ok: true, value: { kind: 'ok' } })
    expect(diffRequests).toEqual([request('/srv/acme/backend/src')])
  })

  it.each([
    ['a relative folder', request('acme/backend')],
    ['a folder that does not exist', request('/srv/acme/gone')],
    ['a file instead of a folder', request('/srv/acme/backend/src/app.ts')],
    ['a NUL in the folder', request('/srv/acme/backend\0')],
    ['an unknown scope', request('/srv/acme/backend', { scope: 'stash' })],
    ['a payload that is not an object', '/srv/acme/backend'],
  ])('should refuse the request without running git when it has %s', async (_label, payload) => {
    const { call, diffRequests, warnings } = setup()

    const result = await call(hostChannels.reviewDiff, payload)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-IPC-003' } } })
    expect(diffRequests).toEqual([])
    expect(warnings).toEqual([{ message: 'review request refused', context: { kind: 'diff' } }])
  })

  it('should read a file only from a root a diff answered with', async () => {
    const { call, fileReads } = setup()

    const before = await call(hostChannels.reviewFile, { root: '/srv/acme/backend', path: 'a.ts' })
    await call(hostChannels.reviewDiff, request('/srv/acme/backend'))
    const after = await call(hostChannels.reviewFile, { root: '/srv/acme/backend', path: 'a.ts' })

    expect(before).toMatchObject({ ok: false })
    expect(after).toEqual({ ok: true, value: ['one'] })
    expect(fileReads).toEqual(['/srv/acme/backend|a.ts'])
  })

  it('should refuse an absolute file path even inside a known root', async () => {
    const { call, fileReads } = setup()
    await call(hostChannels.reviewDiff, request('/srv/acme/backend'))

    const result = await call(hostChannels.reviewFile, {
      root: '/srv/acme/backend',
      path: '/etc/passwd',
    })

    expect(result).toMatchObject({ ok: false })
    expect(fileReads).toEqual([])
  })
})
