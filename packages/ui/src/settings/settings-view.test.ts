// @vitest-environment happy-dom
import {
  type ConnectionFields,
  type ConnectionStatus,
  type Connector,
  createTranslator,
  defaultSettings,
  GITHUB_CONNECTOR,
  GITLAB_CONNECTOR,
  type HostApi,
  mergeSettings,
  type Settings,
  type SettingsFileState,
  type SettingsPatch,
  settingsFileOk,
  type UpdateState,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createKeymap, type Keyboard } from '../platform/keymap.ts'
import type { SettingsClient } from './settings-client.ts'
import { createSettingsView } from './settings-view.ts'

function fakeSettings(
  locked: readonly string[] = [],
  initial: Settings = defaultSettings,
  initialFile: SettingsFileState = settingsFileOk,
) {
  let current: Settings = initial
  let file = initialFile
  let opens = 0
  const patches: SettingsPatch[] = []
  const listeners = new Set<(settings: Settings, changed: readonly string[]) => void>()
  const fileListeners = new Set<(file: SettingsFileState) => void>()
  const client: SettingsClient = {
    current: () => current,
    locked: () => locked,
    async update(patch) {
      patches.push(patch)
      if (file.kind === 'invalid')
        return { settings: current, locked, fresh: false, file, rejected: Object.keys(patch) }
      current = mergeSettings(current, patch)
      return { settings: current, locked, fresh: false, file, rejected: [] }
    },
    onChange: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    file: () => file,
    onFile: (listener) => {
      fileListeners.add(listener)
      return () => void fileListeners.delete(listener)
    },
    openFile: async () => {
      opens += 1
      return opens < 2
    },
  }
  const emit = (changed: readonly string[]) => {
    for (const listener of listeners) listener(current, changed)
  }
  const emitFile = (next: SettingsFileState) => {
    file = next
    for (const listener of fileListeners) listener(next)
  }
  return { client, patches, emit, emitFile, opens: () => opens }
}

// The host's side of the Updates row: its state, the checks asked and the change listeners
function updatesHost(
  initial: UpdateState = { canInstall: true, check: { kind: 'never' }, notice: { kind: 'none' } },
  answer: UpdateState = initial,
) {
  let state = initial
  let checks = 0
  const listeners = new Set<(next: UpdateState) => void>()
  const updates = {
    state: async () => state,
    check: async () => {
      checks += 1
      state = answer
      for (const listener of listeners) listener(state)
      return state
    },
    onChange: (listener: (next: UpdateState) => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return { updates, checks: () => checks }
}

// Only what opening the screen asks the host for
const api = {
  connections: {
    list: async () => [GITLAB_CONNECTOR],
    disabled: async () => [],
    status: async () => ({ kind: 'none' }),
  },
  autostart: { isEnabled: async () => false },
  about: { version: async () => '0.9.0', open: () => undefined },
  updates: updatesHost().updates,
  fonts: {
    system: async () => ({
      terminal: 'MesloLGS NF',
      monospace: 'DejaVu Sans Mono',
      families: ['Cantarell', 'DejaVu Sans Mono', 'MesloLGS NF'],
      monospaceFamilies: ['DejaVu Sans Mono', 'MesloLGS NF'],
      symbols: ['MesloLGS NF'],
    }),
  },
} as unknown as HostApi

function open(
  locked: readonly string[] = [],
  host: HostApi = api,
  initial?: Settings,
  keyboard: Keyboard = 'pc',
  file: SettingsFileState = settingsFileOk,
) {
  document.body.replaceChildren()
  const overlay = document.createElement('div')
  const body = document.createElement('div')
  overlay.append(body)
  document.body.append(overlay)
  const settings = fakeSettings(locked, initial, file)
  let closed = false
  const view = createSettingsView(
    { overlay, body },
    {
      settings: settings.client,
      api: host,
      i18n: createTranslator('en'),
      onClose: () => {
        closed = true
      },
      previewOpacity: () => undefined,
      keymap: createKeymap(keyboard),
    },
  )
  view.open()
  const combobox = (key: string) => {
    const found = body.querySelector<HTMLButtonElement>(`[data-focus="set-${key}"]`)
    if (!found) throw new Error(`invariant: ${key} has a control`)
    return found
  }
  return {
    view,
    body,
    combobox,
    patches: settings.patches,
    emit: settings.emit,
    emitFile: settings.emitFile,
    opens: settings.opens,
    isClosed: () => closed,
  }
}

const press = (target: HTMLElement, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('settings view selects', () => {
  it('should use the design system select for every choice when the screen is drawn', () => {
    const { body, view, combobox } = open()

    const general = [...body.querySelectorAll('[role="combobox"]')].map((element) =>
      element.getAttribute('data-focus'),
    )
    body.querySelector<HTMLElement>('#settings-tab-shortcuts')?.click()

    expect(body.querySelector('select')).toBeNull()
    expect(general).toEqual([
      'set-language',
      'set-theme',
      'set-appearance.fontFamily',
      'set-appearance.codeFontFamily',
      'set-terminal.fontFamily',
      'set-terminal.cursorStyle',
      'set-review.layout',
    ])
    expect(combobox('shortcuts.holdTrigger').getAttribute('role')).toBe('combobox')
    view.close()
  })

  it('should list the Mac keys in the reference when the keyboard is a Mac one', () => {
    // Arrange
    const { body, view } = open([], api, undefined, 'mac')

    // Act
    body.querySelector<HTMLElement>('#settings-tab-shortcuts')?.click()

    // Assert
    const keys = [...body.querySelectorAll('.sref .keys')].map((element) => element.textContent)
    expect(keys).toContain('⌘T')
    expect(keys).toContain('⌃⌘F')
    expect(keys).toContain('⌘= − 0')
    view.close()
  })

  it('should show the global key in the Mac symbols with the fn hint when the keyboard is a Mac one', () => {
    // Arrange
    const chosen = mergeSettings(defaultSettings, { shortcuts: { toggleWindow: 'Super+Alt+K' } })
    const { body, view } = open([], api, chosen, 'mac')

    // Act
    body.querySelector<HTMLElement>('#settings-tab-shortcuts')?.click()

    // Assert
    const row = body.querySelector<HTMLElement>('[data-setting="shortcuts.toggleWindow"]')
    expect(row?.querySelector('.sshortcut .keys')?.textContent).toBe('⌥⌘K')
    expect(row?.querySelector('.shint')?.textContent).toContain('fn')
    view.close()
  })

  it('should hold the right Command by default with no reset when the keyboard is a Mac one', () => {
    // Arrange
    const { body, combobox, view } = open([], api, undefined, 'mac')

    // Act
    body.querySelector<HTMLElement>('#settings-tab-shortcuts')?.click()

    // Assert
    expect(
      combobox('shortcuts.holdTrigger').querySelector('[data-current="true"]')?.textContent,
    ).toBe('Right Command')
    expect(
      body.querySelector<HTMLElement>('.sreset[data-key="shortcuts.holdTrigger"]')?.hidden,
    ).toBe(true)
    view.close()
  })

  it('should offer the right Super only when the file already holds it on a PC keyboard', () => {
    // Arrange
    const chosen = mergeSettings(defaultSettings, { shortcuts: { holdTrigger: 'MetaRight' } })
    const labels = (initial?: Settings) => {
      const { body, combobox, view } = open([], api, initial)
      body.querySelector<HTMLElement>('#settings-tab-shortcuts')?.click()
      const found = [...combobox('shortcuts.holdTrigger').querySelectorAll('.select-value > span')]
      view.close()
      return found.map((element) => element.textContent)
    }

    // Act
    const fresh = labels()
    const kept = labels(chosen)

    // Assert
    expect(fresh).toEqual(['Right Ctrl', 'Left Ctrl', 'Right Alt', 'Left Alt'])
    expect(kept).toContain('Right Super')
  })

  it('should name each select by its row label when the screen is drawn', () => {
    const { body, combobox, view } = open()

    const labelId = combobox('theme').getAttribute('aria-labelledby') ?? ''

    expect(body.querySelector(`#${labelId}`)?.textContent).toBe('Theme')
    view.close()
  })

  it('should save the picked value and keep it and the focus after the redraw when picked by keyboard', async () => {
    const { combobox, patches, view } = open()
    const theme = combobox('theme')
    theme.focus()

    press(theme, 'Enter')
    press(theme, 'ArrowDown')
    press(theme, 'Enter')
    await settle()
    view.rerender()

    expect(patches).toEqual([{ theme: 'light' }])
    expect(combobox('theme').querySelector('[data-current]')?.textContent).toBe('Light')
    expect(document.activeElement).toBe(combobox('theme'))
    view.close()
  })

  it('should save the review layout from its row and bring back Automatic from the same select', async () => {
    const initial = { ...defaultSettings, review: { ...defaultSettings.review, layout: 'side' } }
    const { body, combobox, patches, view } = open([], api, initial as Settings)
    const layout = combobox('review.layout')
    const labelId = layout.getAttribute('aria-labelledby') ?? ''
    const shown = layout.querySelector('[data-current]')?.textContent
    layout.focus()

    press(layout, 'Enter')
    press(layout, 'Home')
    press(layout, 'Enter')
    await settle()

    expect(body.querySelector(`#${labelId}`)?.textContent).toBe('Review layout')
    expect(shown).toBe('Side by side')
    expect(patches).toEqual([{ review: { layout: 'auto' } }])
    view.close()
  })

  it('should close only the list and leave the screen open when Escape is pressed on an open select', () => {
    const { combobox, isClosed, view } = open()
    const language = combobox('language')
    language.focus()
    press(language, 'Enter')

    press(language, 'Escape')

    expect(language.getAttribute('aria-expanded')).toBe('false')
    expect(isClosed()).toBe(false)
    expect(view.isOpen()).toBe(true)
    view.close()
  })

  it('should disable the select of a row locked by the environment when the screen is drawn', () => {
    const { combobox, view } = open(['language'])

    const language = combobox('language')

    expect(language.disabled).toBe(true)
    expect(language.closest('[data-locked="true"]')).not.toBeNull()
    expect(combobox('theme').disabled).toBe(false)
    view.close()
  })
})

describe('settings view, agent connect hint', () => {
  it('should turn the agent connect hint back on when its box is checked in the System page', () => {
    const { body, patches, view } = open()
    body.querySelector<HTMLElement>('#settings-tab-system')?.click()
    const box = body.querySelector<HTMLInputElement>('[data-focus="set-system.agentConnectHint"]')
    if (!box) throw new Error('invariant: the System page has the agent connect hint row')

    box.checked = false
    box.dispatchEvent(new Event('change'))
    box.checked = true
    box.dispatchEvent(new Event('change'))

    expect(body.textContent).toContain('Suggest connecting the agent')
    expect(patches).toEqual([
      { system: { agentConnectHint: false } },
      { system: { agentConnectHint: true } },
    ])
    view.close()
  })
})

describe('settings view, updates', () => {
  const systemPage = (initial: Settings, host: HostApi) => {
    const opened = open([], host, initial)
    opened.body.querySelector<HTMLElement>('#settings-tab-about')?.click()
    const row = opened.body.querySelector<HTMLElement>('[data-setting="system.updates"]')
    const check = opened.body.querySelector<HTMLButtonElement>('[data-focus="set-updates-check"]')
    if (!row || !check) throw new Error('invariant: the About page has the Updates row')
    return { ...opened, row, check }
  }
  const withUpdates = (fake: ReturnType<typeof updatesHost>) =>
    ({ ...api, updates: fake.updates }) as unknown as HostApi
  const mode = (updates: Settings['system']['updates']) =>
    mergeSettings(defaultSettings, { system: { updates } })

  it('should say GitHub is never contacted and disable Check now when updates are off', async () => {
    const fake = updatesHost()
    const { row, check, view } = systemPage(defaultSettings, withUpdates(fake))
    await settle()

    expect(row.textContent).toContain('GitHub is never contacted.')
    expect(check.disabled).toBe(true)
    view.close()
  })

  it('should check and say up to date when Check now is pressed and nothing is newer', async () => {
    const fake = updatesHost(undefined, {
      canInstall: true,
      check: { kind: 'current' },
      notice: { kind: 'none' },
    })
    const { body, check, view } = systemPage(mode('notify'), withUpdates(fake))
    await settle()

    check.click()
    await settle()

    expect(fake.checks()).toBe(1)
    expect(body.querySelector('[data-setting="system.updates"]')?.textContent).toContain(
      'Up to date',
    )
    view.close()
  })

  it('should name the newer version in the row when a check finds one', async () => {
    const fake = updatesHost({
      canInstall: true,
      check: { kind: 'available', version: '0.10.0' },
      notice: { kind: 'available', version: '0.10.0' },
      offer: '0.10.0',
    })
    const { body, view } = systemPage(mode('notify'), withUpdates(fake))
    await settle()

    expect(body.querySelector('[data-setting="system.updates"]')?.textContent).toContain(
      'Version 0.10.0 available',
    )
    view.close()
  })

  it('should say the release page is the way when install is chosen where the cockpit cannot install', async () => {
    const fake = updatesHost({
      canInstall: false,
      check: { kind: 'never' },
      notice: { kind: 'none' },
    })
    const { body, view } = systemPage(mode('install'), withUpdates(fake))
    await settle()

    expect(body.querySelector('[data-setting="system.updates"]')?.textContent).toContain(
      'Tells and opens the release page to install it.',
    )
    view.close()
  })

  it('should save the chosen mode when another one is picked', async () => {
    const { combobox, patches, view } = systemPage(defaultSettings, withUpdates(updatesHost()))

    const select = combobox('system.updates')
    select.focus()
    press(select, 'Enter')
    press(select, 'ArrowDown')
    press(select, 'Enter')
    await settle()

    expect(patches).toEqual([{ system: { updates: 'notify' } }])
    view.close()
  })
})

describe('settings view, projects folder', () => {
  const withPicker = (answer: string | undefined) =>
    ({ ...api, projects: { chooseRoot: async () => answer } }) as unknown as HostApi
  const openProjects = (host: HostApi) => {
    const opened = open([], host)
    opened.body.querySelector<HTMLElement>('#settings-tab-projects')?.click()
    const choose = opened.body.querySelector<HTMLButtonElement>('[data-focus="set-choose-root"]')
    if (!choose) throw new Error('invariant: the Projects page has the choose button')
    return { ...opened, choose }
  }

  it('should show no folder name as a default when the projects folder is unset', () => {
    const { body, view } = openProjects(withPicker(undefined))

    const input = body.querySelector<HTMLInputElement>('[data-focus="set-projects.root"]')

    expect(input?.value).toBe('')
    expect(input?.placeholder).toBe('Not chosen yet')
    view.close()
  })

  it('should save the folder picked in the system picker when Choose is clicked', async () => {
    const { choose, patches, view } = openProjects(withPicker('/home/ana/work'))

    choose.click()
    await settle()

    expect(patches).toEqual([{ projects: { root: '/home/ana/work' } }])
    view.close()
  })

  it('should save nothing when the system picker is cancelled', async () => {
    const { choose, patches, view } = openProjects(withPicker(undefined))

    choose.click()
    await settle()

    expect(patches).toEqual([])
    view.close()
  })
})

const tracker: Connector = {
  id: 'tracker',
  name: 'Acme Tracker',
  connection: {
    address: { placeholder: 'https://tracker.example.com' },
    email: { placeholder: 'ana@example.com' },
    token: { label: 'connections.gitlab.token', hint: 'connections.gitlab.token.hint' },
  },
  views: [
    {
      id: 'tasks',
      kind: 'issue',
      title: 'views.review',
      description: 'views.review.description',
      empty: 'views.empty.review',
    },
  ],
}

function connectionsHost(
  initial: readonly Connector[],
  options: { refuse?: boolean; disabled?: readonly Connector[] } = {},
) {
  let connectors = initial
  let disabled = options.disabled ?? []
  const connects: { id: string; fields: ConnectionFields; token: string }[] = []
  let answer: (() => void) | undefined
  const host = {
    connections: {
      list: async () => connectors,
      disabled: async () => disabled.map(({ id, name }) => ({ extension: `dck.${id}`, id, name })),
      status: async (): Promise<ConnectionStatus> => ({ kind: 'none' }),
      connect: async (id: string, fields: ConnectionFields, token: string) => {
        connects.push({ id, fields, token })
        await new Promise<void>((resolve) => {
          answer = resolve
        })
        return options.refuse
          ? ({ kind: 'error', url: fields.url, code: 'DCK-GLB-001' } satisfies ConnectionStatus)
          : ({
              kind: 'connected',
              url: fields.url,
              user: { username: 'ana', name: 'Ana' },
            } satisfies ConnectionStatus)
      },
      disconnect: async (): Promise<ConnectionStatus> => ({ kind: 'none' }),
    },
    autostart: { isEnabled: async () => false },
    about: { version: async () => '0.9.0', open: () => undefined },
    updates: api.updates,
    fonts: api.fonts,
  } as unknown as HostApi
  return {
    host,
    connects,
    // The host answers the pending connect
    answer: () => answer?.(),
    set: (next: readonly Connector[], nextDisabled: readonly Connector[] = []) => {
      connectors = next
      disabled = nextDisabled
    },
  }
}

const connectionsPage = async (host: HostApi, initial?: Settings) => {
  const page = open([], host, initial)
  page.body.querySelector<HTMLElement>('#settings-tab-connections')?.click()
  await settle()
  await settle()
  const sections = () =>
    [...page.body.querySelectorAll('.spanel .sgroup')].map((section) =>
      [...section.querySelectorAll('.sname2')].map((label) => label.textContent),
    )
  const control = <T extends HTMLElement>(focus: string) => {
    const found = page.body.querySelector<T>(`[data-focus="${focus}"]`)
    if (!found) throw new Error(`invariant: ${focus} exists`)
    return found
  }
  const type = (focus: string, value: string) => {
    const input = control<HTMLInputElement>(focus)
    input.value = value
    input.dispatchEvent(new Event('input'))
  }
  const focused = () => document.activeElement?.getAttribute('data-focus')
  return { ...page, sections, control, type, focused }
}

describe('settings view, connections', () => {
  it('should draw the GitLab section with the same rows as before when GitLab is the only connector', async () => {
    const { sections, body, view } = await connectionsPage(connectionsHost([GITLAB_CONNECTOR]).host)

    expect(sections()).toEqual([['GitLab', 'Address', 'Personal access token', '']])
    expect(
      body.querySelector<HTMLInputElement>('[data-focus="conn-gitlab-url"]')?.placeholder,
    ).toBe('https://gitlab.example.com')
    expect(body.textContent).toContain(
      'read_api scope. Kept in the system keyring, never in a file.',
    )
    view.close()
  })

  it('should put the connected GitLab above the GitHub section that is not connected', async () => {
    const initial = {
      ...defaultSettings,
      connections: { gitlab: { url: 'https://gitlab.example.com' } },
    }

    const { sections, view } = await connectionsPage(
      connectionsHost([GITHUB_CONNECTOR, GITLAB_CONNECTOR]).host,
      initial,
    )

    expect(sections().map((rows) => rows[0])).toEqual(['GitLab', 'GitHub'])
    view.close()
  })

  it('should keep the declared order when both accounts are connected or neither is', async () => {
    const both = {
      ...defaultSettings,
      connections: {
        gitlab: { url: 'https://gitlab.example.com' },
        github: { url: 'https://github.com' },
      },
    }

    for (const initial of [both, defaultSettings]) {
      const { sections, view } = await connectionsPage(
        connectionsHost([GITHUB_CONNECTOR, GITLAB_CONNECTOR]).host,
        initial,
      )

      expect(sections().map((rows) => rows[0])).toEqual(['GitHub', 'GitLab'])
      view.close()
    }
  })

  it('should give GitHub a one-line read-only hint and the github.com placeholder', async () => {
    const { body, view } = await connectionsPage(connectionsHost([GITHUB_CONNECTOR]).host)

    expect(body.textContent).toContain(
      'Fine-grained, read only. Kept in the system keyring, never in a file.',
    )
    expect(body.textContent).not.toContain('An empty address')
    expect(
      body.querySelector<HTMLInputElement>('[data-focus="conn-github-url"]')?.placeholder,
    ).toBe('https://github.com')
    view.close()
  })

  it('should fold the GitHub token permissions and unfold them in place when Permissions is pressed', async () => {
    const { body, control, view } = await connectionsPage(connectionsHost([GITHUB_CONNECTOR]).host)
    const button = control<HTMLButtonElement>('conn-github-permissions')
    const list = () => body.querySelector<HTMLElement>('#conn-github-permissions-list')
    button.focus()

    const before = [button.getAttribute('aria-expanded'), list()?.hidden]
    button.click()

    expect(before).toEqual(['false', true])
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-controls')).toBe('conn-github-permissions-list')
    expect(list()?.hidden).toBe(false)
    expect([...(list()?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'Pull requests: Read',
      'Commit statuses: Read',
      'Metadata: Read',
      'A classic token needs the repo scope for private repositories, and only a classic token reads their checks.',
    ])
    expect(document.activeElement).toBe(button)
    view.close()
  })

  it('should keep the permissions open across a redraw and fold them again on a second press', async () => {
    const { body, control, view, emit } = await connectionsPage(
      connectionsHost([GITHUB_CONNECTOR]).host,
    )
    const first = control<HTMLButtonElement>('conn-github-permissions')
    first.click()

    emit(['theme'])
    await settle()
    const reopened = control<HTMLButtonElement>('conn-github-permissions')
    const stillOpen = reopened.getAttribute('aria-expanded')
    reopened.click()

    expect(reopened).not.toBe(first)
    expect(stillOpen).toBe('true')
    expect(body.querySelector<HTMLElement>('#conn-github-permissions-list')?.hidden).toBe(true)
    view.close()
  })

  it('should give the GitLab token no permissions button since it declares none', async () => {
    const { body, view } = await connectionsPage(connectionsHost([GITLAB_CONNECTOR]).host)

    expect(body.querySelector('.sdisclose')).toBeNull()
    view.close()
  })

  it('should draw one section per connector with the fields each one declares', async () => {
    const { sections, view } = await connectionsPage(
      connectionsHost([GITLAB_CONNECTOR, tracker]).host,
    )

    expect(sections()).toEqual([
      ['GitLab', 'Address', 'Personal access token', ''],
      ['Acme Tracker', 'Address', 'Email', 'Personal access token', ''],
    ])
    view.close()
  })

  it('should send the address, the e-mail and the token of that connector when connecting', async () => {
    const fake = connectionsHost([tracker])
    const { body, view, type, control } = await connectionsPage(fake.host)
    type('conn-tracker-url', 'https://tracker.example.com')
    type('conn-tracker-email', 'ana@example.com')
    type('conn-tracker-token', 'secret-token')

    control('conn-tracker-connect').click()
    fake.answer()
    await settle()

    expect(fake.connects).toEqual([
      {
        id: 'tracker',
        fields: { url: 'https://tracker.example.com', email: 'ana@example.com' },
        token: 'secret-token',
      },
    ])
    expect(body.textContent).toContain('Connected as ana')
    view.close()
  })

  it('should take the section away and offer to enable it when the connector is disabled', async () => {
    const fake = connectionsHost([GITLAB_CONNECTOR])
    const { sections, emit, body, view } = await connectionsPage(fake.host)
    fake.set([], [GITLAB_CONNECTOR])

    emit(['extensions.disabled'])
    await settle()

    expect(sections()).toEqual([['GitLab · Disabled']])
    expect(body.textContent).not.toContain('dck ext')
    expect(body.querySelector('[data-focus="conn-gitlab-enable"]')?.textContent).toBe('Enable')
    view.close()
  })

  it('should take the extension out of the disabled list and bring the section back when Enable is clicked', async () => {
    const fake = connectionsHost([], { disabled: [GITLAB_CONNECTOR] })
    const initial = { ...defaultSettings, extensions: { disabled: ['acme.other', 'dck.gitlab'] } }
    const page = await connectionsPage(fake.host, initial)
    page.control('conn-gitlab-enable').click()
    await settle()
    fake.set([GITLAB_CONNECTOR])

    page.emit(['extensions.disabled'])
    await settle()
    await settle()

    expect(page.patches).toEqual([{ extensions: { disabled: ['acme.other'] } }])
    expect(page.sections()).toEqual([['GitLab', 'Address', 'Personal access token', '']])
    expect(page.focused()).toBe('conn-gitlab-url')
    page.view.close()
  })

  it('should show only that nothing is available when no connector exists at all', async () => {
    const { sections, body, view } = await connectionsPage(connectionsHost([]).host)

    expect(sections()).toEqual([[]])
    expect(body.querySelector('.spanel')?.textContent).toBe('No connections available.')
    view.close()
  })
})

describe('settings view, focus around a connection', () => {
  it('should keep the token field focused and busy while checking, then focus Disconnect when it connects', async () => {
    const fake = connectionsHost([GITLAB_CONNECTOR])
    const page = await connectionsPage(fake.host)
    page.type('conn-gitlab-url', 'https://gitlab.example.com')
    page.type('conn-gitlab-token', 'glpat-x')
    page.control('conn-gitlab-token').focus()

    press(page.control('conn-gitlab-token'), 'Enter')
    await settle()
    const whileChecking = {
      focused: page.focused(),
      busy: page.control('conn-gitlab-connect').getAttribute('aria-busy'),
    }
    fake.answer()
    await settle()

    expect(whileChecking).toEqual({ focused: 'conn-gitlab-token', busy: 'true' })
    expect(page.focused()).toBe('conn-gitlab-disconnect')
    page.view.close()
  })

  it('should focus the token field with the reason attached when the connection fails', async () => {
    const fake = connectionsHost([GITLAB_CONNECTOR], { refuse: true })
    const page = await connectionsPage(fake.host)
    page.type('conn-gitlab-url', 'https://gitlab.example.com')
    page.type('conn-gitlab-token', 'glpat-wrong')

    page.control('conn-gitlab-connect').click()
    fake.answer()
    await settle()

    const token = page.control('conn-gitlab-token')
    expect(page.focused()).toBe('conn-gitlab-token')
    expect(page.body.querySelector(`#${token.getAttribute('aria-describedby')}`)?.textContent).toBe(
      'GitLab refused the token. Check that it has not expired or been revoked.',
    )
    page.view.close()
  })

  it('should focus the address field after disconnecting', async () => {
    const fake = connectionsHost([GITLAB_CONNECTOR])
    const page = await connectionsPage(fake.host)
    page.type('conn-gitlab-token', 'glpat-x')
    page.control('conn-gitlab-connect').click()
    fake.answer()
    await settle()

    page.control('conn-gitlab-disconnect').click()
    await settle()

    expect(page.focused()).toBe('conn-gitlab-url')
    page.view.close()
  })

  it('should close Settings with Escape while the account is being checked', async () => {
    const fake = connectionsHost([GITLAB_CONNECTOR])
    const page = await connectionsPage(fake.host)
    page.type('conn-gitlab-token', 'glpat-x')
    page.control('conn-gitlab-connect').focus()
    page.control('conn-gitlab-connect').click()
    await settle()

    press(document.activeElement as HTMLElement, 'Escape')

    expect(page.isClosed()).toBe(true)
    fake.answer()
  })
})

describe('settings view, the settings file', () => {
  const withIssues: SettingsFileState = {
    kind: 'ok',
    issues: [
      { key: 'theme', kind: 'ignored', found: '"purple"', used: '"dark"' },
      { key: 'system.notifyAfterSeconds', kind: 'adjusted', found: '2', used: '5' },
      { key: 'them', kind: 'unknown', found: '"light"' },
    ],
  }

  const noteOf = (body: HTMLElement, key: string) =>
    body.querySelector(`[data-setting="${key}"] .snote`)?.textContent

  it('should show no word on the file and no strip when the file is used as written', () => {
    // Arrange, Act
    const { body, view } = open()

    // Assert
    expect(body.querySelector('.sfile-dot')).toBeNull()
    expect(body.querySelector('.sbroken')).toBeNull()
    expect(body.querySelector('.snav-mark')).toBeNull()
    view.close()
  })

  it('should put a dot on the file button and count the warnings in its tooltip when the file has some', () => {
    // Arrange, Act
    const { body, view } = open([], api, undefined, 'pc', withIssues)
    const button = body.querySelector<HTMLButtonElement>('[data-focus="set-open-file"]')

    // Assert
    expect(button?.querySelector('.sfile-dot')).not.toBeNull()
    expect(button?.dataset.tip).toBe('Open the settings file: 3 warnings')
    expect(button?.getAttribute('aria-label')).toBe('Open the settings file: 3 warnings')
    expect(body.querySelector('.shead-actions')?.textContent).toBe('')
    view.close()
  })

  it('should tell under each setting what the file holds and what is used instead', () => {
    // Arrange
    const file: SettingsFileState = {
      kind: 'ok',
      issues: [
        ...withIssues.issues,
        { key: 'terminal.fontFamily', kind: 'ignored', found: '"Nope;}"', used: 'null' },
      ],
    }

    // Act
    const { body, view } = open([], api, undefined, 'pc', file)
    const general = [noteOf(body, 'theme'), noteOf(body, 'terminal.fontFamily')]
    body.querySelector<HTMLElement>('#settings-tab-system')?.click()

    // Assert
    expect(general).toEqual([
      'In settings.json: "purple". Not valid, uses the default.',
      'In settings.json: "Nope;}". Not valid, uses the default.',
    ])
    expect(noteOf(body, 'system.notifyAfterSeconds')).toBe('In settings.json: 2. Adjusted to 5.')
    view.close()
  })

  it('should mark the pages holding a setting the file got wrong and no page for an unknown key', () => {
    // Arrange, Act
    const { body, view } = open([], api, undefined, 'pc', withIssues)
    const marked = [...body.querySelectorAll('.snav-item')]
      .filter((item) => item.querySelector('.snav-mark'))
      .map((item) => item.id)

    // Assert
    expect(marked).toEqual(['settings-tab-general', 'settings-tab-system'])
    expect(body.querySelector('#settings-tab-general')?.getAttribute('aria-description')).toBe(
      'Has a setting that settings.json holds wrongly',
    )
    view.close()
  })

  it('should offer the reset on a setting the file holds wrongly even when the default is in use', async () => {
    // Arrange
    const { body, patches, view } = open([], api, undefined, 'pc', withIssues)
    const reset = body.querySelector<HTMLButtonElement>('[data-setting="theme"] .sreset')

    // Act
    const shown = reset?.hidden === false
    reset?.click()
    await settle()

    // Assert
    expect(shown).toBe(true)
    expect(patches).toEqual([{ theme: 'dark' }])
    view.close()
  })

  it('should say where the file broke above the page and disable the controls when it is not valid', () => {
    // Arrange, Act
    const { body, combobox, view } = open([], api, undefined, 'pc', {
      kind: 'invalid',
      line: 4,
      column: 12,
    })
    const strip = body.querySelector('.smain > .sbroken')

    // Assert
    expect(strip?.querySelector('p')?.textContent).toBe(
      'settings.json has an error at line 4, column 12.',
    )
    expect(strip?.nextElementSibling?.id).toBe('settings-panel')
    expect(combobox('theme').disabled).toBe(true)
    expect(body.querySelector<HTMLInputElement>('[data-focus="set-fontSize"]')?.disabled).toBe(true)
    expect(body.querySelector('.sfile-dot')).toBeNull()
    view.close()
  })

  it('should open the file from the strip when the file is broken', async () => {
    // Arrange
    const { body, opens, view } = open([], api, undefined, 'pc', {
      kind: 'invalid',
      line: 1,
      column: 2,
    })

    // Act
    body.querySelector<HTMLButtonElement>('.sbroken-open')?.click()
    await settle()

    // Assert
    expect(opens()).toBe(1)
    view.close()
  })

  it('should draw the warnings at once when the file is saved by hand while the screen is open', () => {
    // Arrange
    const { body, emitFile, view } = open()

    // Act
    emitFile(withIssues)

    // Assert
    expect(body.querySelector('[data-focus="set-open-file"] .sfile-dot')).not.toBeNull()
    expect(noteOf(body, 'theme')).toBe('In settings.json: "purple". Not valid, uses the default.')
    view.close()
  })

  it('should open the file from the header button and say so when no app opened it', async () => {
    // Arrange
    const { body, opens, view } = open()
    const button = body.querySelector<HTMLButtonElement>('[data-focus="set-open-file"]')

    // Act: the fake host opens the file the first time only
    button?.click()
    await settle()
    const opened = body.querySelector('.sfile-failed')
    body.querySelector<HTMLButtonElement>('[data-focus="set-open-file"]')?.click()
    await settle()

    // Assert
    expect(button?.getAttribute('data-tip')).toBe('Open the settings file')
    expect(opened).toBeNull()
    expect(opens()).toBe(2)
    expect(body.querySelector('.sfile-failed')?.textContent).toBe('No app opened settings.json.')
    view.close()
  })

  it('should say beside the field that a typed number was adjusted when it is out of range', async () => {
    const { body, view } = open()
    body.querySelector<HTMLElement>('#settings-tab-system')?.click()
    const input = body.querySelector<HTMLInputElement>(
      '[data-focus="set-system.notifyAfterSeconds"]',
    )
    if (!input) throw new Error('invariant: the System page has the notify field')

    input.value = '2'
    input.dispatchEvent(new Event('change'))
    await settle()

    const field = body.querySelector<HTMLInputElement>(
      '[data-focus="set-system.notifyAfterSeconds"]',
    )
    expect(field?.value).toBe('5')
    expect(body.querySelector('.snote')?.textContent).toBe('Adjusted to 5: the range is 5 to 600.')
    view.close()
  })

  it('should say beside the folder field that the folder does not exist when the file reports it', () => {
    const missing: SettingsFileState = {
      kind: 'ok',
      issues: [{ key: 'projects.root', kind: 'missingFolder', found: '"/home/ana/gone"' }],
    }
    const { body, view } = open([], api, undefined, 'pc', missing)

    body.querySelector<HTMLElement>('#settings-tab-projects')?.click()

    expect(body.querySelector('.snote')?.textContent).toBe('This folder does not exist.')
    view.close()
  })
})

describe('settings view fonts and cursor', () => {
  const optionLabels = (control: HTMLElement) =>
    [...(control.parentElement?.querySelectorAll('.select-label') ?? [])].map(
      (option) => option.textContent,
    )

  it('should name the terminal font of the system in the default option when the host found it', async () => {
    // Arrange
    const { combobox, view } = open()
    await settle()
    const font = combobox('terminal.fontFamily')

    // Act
    press(font, 'Enter')

    // Assert
    expect(font.querySelector('[data-current]')?.textContent).toBe('System (MesloLGS NF)')
    expect(optionLabels(font)).toEqual(['System (MesloLGS NF)', 'DejaVu Sans Mono', 'MesloLGS NF'])
    view.close()
  })

  it('should save the picked family and null for the default when picked by keyboard', async () => {
    // Arrange
    const { combobox, patches, view } = open()
    await settle()
    const font = combobox('appearance.codeFontFamily')
    font.focus()

    // Act
    press(font, 'Enter')
    press(font, 'End')
    press(font, 'Enter')
    await settle()
    press(combobox('appearance.codeFontFamily'), 'Enter')
    press(combobox('appearance.codeFontFamily'), 'Home')
    press(combobox('appearance.codeFontFamily'), 'Enter')
    await settle()

    // Assert
    expect(patches).toEqual([
      { appearance: { codeFontFamily: 'MesloLGS NF' } },
      { appearance: { codeFontFamily: null } },
    ])
    view.close()
  })

  it('should keep a font set by hand listed and chosen when it is not installed', async () => {
    // Arrange
    const initial = {
      ...defaultSettings,
      terminal: { ...defaultSettings.terminal, fontFamily: 'Hack' },
    }

    // Act
    const { combobox, view } = open([], api, initial)
    await settle()

    // Assert
    expect(combobox('terminal.fontFamily').querySelector('[data-current]')?.textContent).toBe(
      'Hack',
    )
    view.close()
  })

  it('should save which Option is Meta from the Terminal group when the keyboard is a Mac one', async () => {
    // Arrange
    const { combobox, patches, view } = open([], api, undefined, 'mac')
    const option = combobox('terminal.macOptionAsMeta')
    const shown = option.querySelector('[data-current="true"]')?.textContent
    option.focus()

    // Act
    press(option, 'Enter')
    press(option, 'ArrowDown')
    press(option, 'Enter')
    await settle()

    // Assert
    expect(shown).toBe('Left Option')
    expect(patches).toEqual([{ terminal: { macOptionAsMeta: 'both' } }])
    view.close()
  })

  it('should save the bar cursor and its blink from the Terminal group', async () => {
    // Arrange
    const { body, combobox, patches, view } = open()
    const cursor = combobox('terminal.cursorStyle')
    cursor.focus()

    // Act
    press(cursor, 'Enter')
    press(cursor, 'ArrowDown')
    press(cursor, 'Enter')
    body.querySelector<HTMLInputElement>('[data-focus="set-terminal.cursorBlink"]')?.click()
    await settle()

    // Assert
    expect(patches).toEqual([
      { terminal: { cursorStyle: 'bar' } },
      { terminal: { cursorBlink: false } },
    ])
    view.close()
  })
})

describe('settings view, about', () => {
  it('should name the cockpit, the version that runs and open its pages by name', async () => {
    // Arrange
    const asked: string[] = []
    const host = {
      ...api,
      about: { version: async () => '1.2.3', open: (link: string) => void asked.push(link) },
    } as unknown as HostApi
    const { body, view } = open([], host)
    await settle()

    // Act
    body.querySelector<HTMLElement>('#settings-tab-about')?.click()
    for (const link of ['repository', 'releaseNotes', 'issue', 'license'])
      body.querySelector<HTMLButtonElement>(`[data-focus="about-${link}"]`)?.click()

    // Assert
    expect(body.querySelector('.sabout-name')?.textContent).toBe('Dev Cockpit')
    expect(body.querySelector('.sabout-version')?.textContent).toBe('Version 1.2.3')
    expect(body.querySelector('[data-setting="system.updates"]')).not.toBeNull()
    expect(asked).toEqual(['repository', 'releaseNotes', 'issue', 'license'])
    view.close()
  })
})
