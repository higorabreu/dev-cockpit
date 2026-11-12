import {
  defaultSettings,
  hostChannels,
  ok,
  type RulesView,
  silentLogger,
  type TabNotification,
} from '@dck/core'
import { FakePtyHost, MemoryClipboard } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { type IpcMainApi, registerHostBridge } from './host-bridge.ts'

const rulesView = (root: string): RulesView => ({
  root,
  rules: [],
  invalid: [],
  agents: { file: `${root}/AGENTS.md`, shared: false, stale: false, claudeImportMissing: false },
})

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
  const gitlabConnects: { url: string; token: string }[] = []
  const viewRefreshes: { view: string; maxAgeMs: number | undefined }[] = []
  const opened: string[] = []
  const rulesCalls: unknown[][] = []
  const changeRules = async (name: string, cwd: string, ...args: unknown[]) => {
    rulesCalls.push([name, cwd, ...args])
    return ok(rulesView(cwd))
  }
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
    gitlab: {
      status: async () => ({ kind: 'none' as const }),
      connect: async (url, token) => {
        gitlabConnects.push({ url, token })
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
    external: { open: (url) => void opened.push(url), allowedOrigin: () => 'https://gl.test' },
    notifier: { notify: (notification) => void notified.push(notification) },
    projects: {
      list: async () => [{ name: 'alpha', path: '/p/alpha' }],
      touch: async (path: string) => void touched.push(path),
      toggleFavorite: async (path: string) => !path.endsWith('/pinned'),
    },
    rules: {
      view: async (cwd) => rulesView(cwd),
      setEnabled: (cwd, id, enabled) => changeRules('setEnabled', cwd, id, enabled),
      setField: (cwd, id, check, name, value) =>
        changeRules('setField', cwd, id, check, name, value),
      shareWithAgents: (cwd, on) => changeRules('shareWithAgents', cwd, on),
      addClaudeImport: (cwd) => changeRules('addClaudeImport', cwd),
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
    gitlabConnects,
    viewRefreshes,
    opened,
    rulesCalls,
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

describe('registerHostBridge gitlab connection', () => {
  it('should forward the address and the trimmed token when the request is valid', async () => {
    const { call, gitlabConnects } = setup()

    await call(hostChannels.connectionsGitlabConnect, {
      url: 'https://gl.test',
      token: ' glpat-x ',
    })

    expect(gitlabConnects).toEqual([{ url: 'https://gl.test', token: 'glpat-x' }])
  })

  it.each([
    ['no token', { url: 'https://gl.test', token: '  ' }],
    ['a payload that is not an object', 'glpat-x'],
    ['a token that is too long', { url: 'https://gl.test', token: 'x'.repeat(513) }],
  ])('should refuse the request without connecting when it has %s', async (_label, payload) => {
    const { call, gitlabConnects } = setup()

    const status = await call(hostChannels.connectionsGitlabConnect, payload)

    expect(status).toEqual({ kind: 'error', url: undefined, code: 'DCK-GLB-007' })
    expect(gitlabConnects).toEqual([])
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
})

describe('registerHostBridge external', () => {
  it('should open the address when it belongs to the connected GitLab', () => {
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

describe('registerHostBridge rules', () => {
  it('should return the rules of the directory the tab is in when the interface asks', async () => {
    const { call, ptyHost } = setup()
    const id = await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

    const view = await call(hostChannels.rulesGet, id)

    expect(view).toEqual(rulesView(`/pid/${ptyHost.sessions[0]?.pid}`))
  })

  it.each([
    ['the session does not exist', 99],
    ['the id is not a number', 'tab-1'],
  ])('should return nothing when %s and the rules are asked', async (_label, id) => {
    const { call } = setup()

    expect(await call(hostChannels.rulesGet, id)).toBeUndefined()
  })

  it('should pass each change with the directory of the tab when the request is valid', async () => {
    const { call, ptyHost, rulesCalls } = setup()
    const ptyId = await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })
    const cwd = `/pid/${ptyHost.sessions[0]?.pid}`

    const result = await call(hostChannels.rulesSetEnabled, {
      ptyId,
      id: 'branch-format',
      enabled: true,
    })
    await call(hostChannels.rulesSetField, {
      ptyId,
      id: 'commit-message',
      check: 1,
      name: 'maxLength',
      value: 50,
    })
    await call(hostChannels.rulesSetField, {
      ptyId,
      id: 'branch-format',
      check: 0,
      name: 'types',
      value: 'feat|fix',
    })
    await call(hostChannels.rulesShareWithAgents, { ptyId, on: true })
    await call(hostChannels.rulesAddClaudeImport, { ptyId })

    expect(result).toEqual({ ok: true, value: rulesView(cwd) })
    expect(rulesCalls).toEqual([
      ['setEnabled', cwd, 'branch-format', true],
      ['setField', cwd, 'commit-message', 1, 'maxLength', 50],
      ['setField', cwd, 'branch-format', 0, 'types', 'feat|fix'],
      ['shareWithAgents', cwd, true],
      ['addClaudeImport', cwd],
    ])
  })

  it.each([
    [
      'a switch that is not a boolean',
      hostChannels.rulesSetEnabled,
      { ptyId: 1, id: 'branch-format', enabled: 'yes' },
    ],
    [
      'an id that is too long',
      hostChannels.rulesSetEnabled,
      { ptyId: 1, id: 'x'.repeat(65), enabled: true },
    ],
    [
      'a check that is not a position',
      hostChannels.rulesSetField,
      { ptyId: 1, id: 'branch-format', check: -1, name: 'types', value: 'feat' },
    ],
    [
      'a value that is an object',
      hostChannels.rulesSetField,
      { ptyId: 1, id: 'branch-format', check: 0, name: 'types', value: { text: 'feat' } },
    ],
    [
      'a value that is too long',
      hostChannels.rulesSetField,
      { ptyId: 1, id: 'branch-format', check: 0, name: 'types', value: 'x'.repeat(501) },
    ],
    ['no answer to share or not', hostChannels.rulesShareWithAgents, { ptyId: 1 }],
    ['a payload that is not an object', hostChannels.rulesAddClaudeImport, 1],
  ])(
    'should refuse the change without writing when it has %s',
    async (_label, channel, payload) => {
      const { call, rulesCalls } = setup()
      await call(hostChannels.ptyCreate, { cols: 80, rows: 24 })

      const result = await call(channel, payload)

      expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-IPC-003' } } })
      expect(rulesCalls).toEqual([])
    },
  )

  it('should fail the change without writing when the session does not exist', async () => {
    const { call, rulesCalls } = setup()

    const result = await call(hostChannels.rulesShareWithAgents, { ptyId: 99, on: true })

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-003' } } })
    expect(rulesCalls).toEqual([])
  })
})
