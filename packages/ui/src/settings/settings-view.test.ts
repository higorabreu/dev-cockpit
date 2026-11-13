// @vitest-environment happy-dom
import {
  type ConnectionFields,
  type ConnectionStatus,
  type Connector,
  createTranslator,
  defaultSettings,
  GITLAB_CONNECTOR,
  type HostApi,
  type Settings,
  type SettingsPatch,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import type { SettingsClient } from './settings-client.ts'
import { createSettingsView } from './settings-view.ts'

function fakeSettings(locked: readonly string[] = []) {
  let current: Settings = defaultSettings
  const patches: SettingsPatch[] = []
  const listeners = new Set<(settings: Settings, changed: readonly string[]) => void>()
  const client: SettingsClient = {
    current: () => current,
    locked: () => locked,
    async update(patch) {
      patches.push(patch)
      current = { ...current, ...patch } as Settings
      return { settings: current, locked, fresh: false, rejected: [] }
    },
    onChange: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  const emit = (changed: readonly string[]) => {
    for (const listener of listeners) listener(current, changed)
  }
  return { client, patches, emit }
}

// Only what opening the screen asks the host for
const api = {
  connections: { list: async () => [GITLAB_CONNECTOR], status: async () => ({ kind: 'none' }) },
  autostart: { isEnabled: async () => false },
} as unknown as HostApi

function open(locked: readonly string[] = [], host: HostApi = api) {
  document.body.replaceChildren()
  const overlay = document.createElement('div')
  const body = document.createElement('div')
  overlay.append(body)
  document.body.append(overlay)
  const settings = fakeSettings(locked)
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
    expect(general).toEqual(['set-language', 'set-theme'])
    expect(combobox('shortcuts.holdTrigger').getAttribute('role')).toBe('combobox')
    view.close()
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

const tracker: Connector = {
  id: 'tracker',
  name: 'Acme Tracker',
  connection: {
    address: { placeholder: 'https://tracker.example.com' },
    email: { placeholder: 'ana@example.com' },
    token: { label: 'connections.gitlab.token', hint: 'connections.gitlab.token.hint' },
  },
  views: [{ id: 'tasks', kind: 'issue', title: 'views.review', empty: 'views.empty.review' }],
}

function connectionsHost(initial: readonly Connector[], options: { refuse?: boolean } = {}) {
  let connectors = initial
  const connects: { id: string; fields: ConnectionFields; token: string }[] = []
  let answer: (() => void) | undefined
  const host = {
    connections: {
      list: async () => connectors,
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
  } as unknown as HostApi
  return {
    host,
    connects,
    // The host answers the pending connect
    answer: () => answer?.(),
    set: (next: readonly Connector[]) => {
      connectors = next
    },
  }
}

const connectionsPage = async (host: HostApi) => {
  const page = open([], host)
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

  it('should take the section away when the connector is disabled while the page is open', async () => {
    const fake = connectionsHost([GITLAB_CONNECTOR])
    const { sections, emit, body, view } = await connectionsPage(fake.host)
    fake.set([])

    emit(['extensions.disabled'])
    await settle()

    expect(sections()).toEqual([[]])
    expect(body.textContent).toContain(
      'No connections available. Turn one on in a terminal with dck ext enable <id>',
    )
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
