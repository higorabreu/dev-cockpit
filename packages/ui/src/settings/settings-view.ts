import {
  acceleratorFromEvent,
  type ConnectionStatus,
  type Connector,
  connectionErrorKey,
  type DisabledConnector,
  defaultSettings,
  HOLD_TRIGGERS,
  type HostApi,
  LIMITS,
  type Settings,
  type SettingsPatch,
  type Translator,
} from '@dck/core'
import { trapFocus } from '../kit/focus-trap.ts'
import { closeButton } from '../kit/panel-frame.ts'
import { createSelect } from '../kit/select.ts'
import { h } from '../panel/dom.ts'
import { inputGate } from '../platform/input-gate.ts'
import type { SettingsClient } from './settings-client.ts'

type Child = Node | string | false | undefined

export interface SettingsViewElements {
  readonly overlay: HTMLElement
  readonly body: HTMLElement
}

const getPath = (source: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], source)

// Builds the nested patch for a dotted key: 'window.heightRatio' becomes { window: { heightRatio } }
function patchFor(key: string, value: unknown): SettingsPatch {
  const path = key.split('.')
  const patch: Record<string, unknown> = {}
  let target = patch
  for (const [index, part] of path.entries()) {
    if (index === path.length - 1) target[part] = value
    else {
      const child: Record<string, unknown> = {}
      target[part] = child
      target = child
    }
  }
  return patch as SettingsPatch
}

const REFERENCE: ReadonlyArray<readonly [string, string]> = [
  ['tabs.new', 'Ctrl+Shift+T'],
  ['tabs.close', 'Ctrl+Shift+W'],
  ['tabs.next', 'Ctrl+Tab'],
  ['tabs.previous', 'Ctrl+Shift+Tab'],
  ['projects.search', 'Ctrl+Shift+P'],
  ['views.open', 'Ctrl+Shift+M'],
  ['menu.system.panel', 'Ctrl+Shift+B'],
  ['menu.system.theme', 'Ctrl+Shift+L'],
  ['menu.system.fullHeight', 'F11'],
  ['settings.ref.opacity', 'Ctrl+Shift+↑ ↓'],
  ['settings.ref.font', 'Ctrl + − 0'],
  ['settings.ref.settings', 'Ctrl+,'],
]

const TABS = [
  { id: 'general', label: 'settings.tab.general' },
  { id: 'shortcuts', label: 'settings.group.shortcuts' },
  { id: 'projects', label: 'settings.group.projects' },
  { id: 'connections', label: 'settings.group.connections' },
  { id: 'system', label: 'settings.group.system' },
] as const

type TabId = (typeof TABS)[number]['id']

export function createSettingsView(
  elements: SettingsViewElements,
  deps: {
    readonly settings: SettingsClient
    readonly api: HostApi
    readonly i18n: Translator
    onClose(): void
    // Shows the opacity while the control is dragged, before saving
    previewOpacity(value: number): void
  },
) {
  const { overlay, body } = elements
  const { settings, api, i18n } = deps
  const t = i18n.t
  let recording = false
  let autostart = false
  let confirmingReset = false
  let activeTab: TabId = TABS[0].id
  // The enabled connectors, each with its own section on the Connections page
  let connectors: readonly Connector[] = []
  // Turned off with `dck ext disable`; listed at the end with a way to turn them back on
  let disabledConnectors: readonly DisabledConnector[] = []
  // Until the first answer the page stays blank, so it does not flash the "none available" text
  let listed = false
  // Where the next drawing puts the focus, when an action replaced the control that had it
  let focusNext: string | undefined
  const statuses = new Map<string, ConnectionStatus | 'checking'>()
  // What was typed and not connected yet. The token only exists here between typing and connecting, and
  // the screen never gets it back
  const drafts = new Map<string, { url?: string; email?: string; token: string }>()
  const draftOf = (id: string) => {
    const found = drafts.get(id) ?? { token: '' }
    drafts.set(id, found)
    return found
  }
  // Mensagem de erro por chave, mostrada junto ao controle
  const errors = new Map<string, string>()
  // Changes made here need not redraw everything: the control already has the right value
  let local = 0

  const isOpen = () => overlay.classList.contains('open')

  async function commit(patch: SettingsPatch, errorKey?: string) {
    local += 1
    try {
      const result = await settings.update(patch)
      if (errorKey) {
        if (result.rejected.length > 0) errors.set(errorKey, t('settings.shortcutRefused'))
        else errors.delete(errorKey)
      }
      return result
    } finally {
      local -= 1
      if (errorKey) render()
      else refreshResets()
    }
  }

  const differs = (key: string, current: Settings) =>
    getPath(current, key) !== getPath(defaultSettings, key)

  function resetButton(key: string): HTMLElement {
    const button = h('button', {
      type: 'button',
      class: 'sreset',
      'data-key': key,
      'data-tip': t('settings.reset'),
      'aria-label': t('settings.reset'),
    })
    button.textContent = '↺'
    button.hidden = !differs(key, settings.current()) || settings.locked().includes(key)
    button.addEventListener('click', () => {
      void commit(
        patchFor(key, getPath(defaultSettings, key)),
        key === 'shortcuts.toggleWindow' ? key : undefined,
      ).then(render)
    })
    return button
  }

  // Shows or hides each row's "restore" depending on the current value
  function refreshResets() {
    for (const button of body.querySelectorAll<HTMLElement>('.sreset')) {
      const key = button.dataset.key ?? ''
      button.hidden = !differs(key, settings.current()) || settings.locked().includes(key)
    }
  }

  const labelId = (key: string) => `set-label-${key.replace(/\./g, '-')}`

  function row(
    key: string,
    label: string,
    control: Child,
    hint?: string,
    resettable = true,
  ): HTMLElement {
    const locked = settings.locked().includes(key)
    const error = errors.get(key)
    return h(
      'div',
      { class: 'srow2', 'data-locked': locked ? 'true' : undefined },
      h(
        'div',
        { class: 'slabel' },
        h('span', { class: 'sname2', id: labelId(key) }, label),
        (locked ? t('settings.locked') : hint) &&
          h('span', { class: 'shint' }, locked ? t('settings.locked') : (hint ?? '')),
        error && h('span', { class: 'serror', role: 'alert' }, error),
      ),
      h('div', { class: 'scontrol' }, control, resettable && resetButton(key)),
    )
  }

  const disabled = (key: string) => settings.locked().includes(key)

  function select(key: string, options: ReadonlyArray<readonly [string, string]>): HTMLElement {
    const control = createSelect({
      id: `set-${key.replace(/\./g, '-')}`,
      options: options.map(([value, label]) => ({ value, label })),
      value: String(getPath(settings.current(), key)),
      labelledBy: labelId(key),
      disabled: disabled(key),
      onChange: (value) => void commit(patchFor(key, value)),
    })
    control.button.dataset.focus = `set-${key}`
    return control.element
  }

  // The stored value is a fraction (0.6); the bar and the text show a percentage (60)
  function percent(
    key: string,
    limits: { readonly min: number; readonly max: number },
    preview?: (fraction: number) => void,
  ): HTMLElement {
    const fraction = Number(getPath(settings.current(), key))
    const input = h('input', {
      type: 'range',
      min: String(Math.round(limits.min * 100)),
      max: String(Math.round(limits.max * 100)),
      step: '5',
      'data-focus': `set-${key}`,
      disabled: disabled(key),
    })
    input.value = String(Math.round(fraction * 100))
    const label = h('span', { class: 'svalue' }, `${Math.round(fraction * 100)}%`)
    input.addEventListener('input', () => {
      label.textContent = `${Number(input.value)}%`
      preview?.(Number(input.value) / 100)
    })
    input.addEventListener('change', () => void commit(patchFor(key, Number(input.value) / 100)))
    return h('span', { class: 'srange' }, input, label)
  }

  function number(key: string, min: number, max: number, unit?: string): HTMLElement {
    const input = h('input', {
      type: 'number',
      min: String(min),
      max: String(max),
      'data-focus': `set-${key}`,
      disabled: disabled(key),
    })
    input.value = String(getPath(settings.current(), key))
    input.addEventListener('change', () => {
      const parsed = Number(input.value)
      if (Number.isFinite(parsed)) void commit(patchFor(key, parsed)).then(render)
    })
    return h('span', { class: 'snumber' }, input, unit && h('span', { class: 'sunit' }, unit))
  }

  function checkbox(
    key: string,
    onChange?: (checked: boolean) => void,
    checked?: boolean,
  ): HTMLElement {
    const input = h('input', {
      type: 'checkbox',
      'data-focus': `set-${key}`,
      disabled: disabled(key),
    })
    input.checked = checked ?? getPath(settings.current(), key) === true
    input.addEventListener('change', () => {
      if (onChange) onChange(input.checked)
      else void commit(patchFor(key, input.checked))
    })
    return input
  }

  function rootInput(): HTMLElement {
    const key = 'projects.root'
    const input = h('input', {
      type: 'text',
      spellcheck: 'false',
      autocomplete: 'off',
      placeholder: t('settings.projectsRoot.placeholder'),
      'data-focus': `set-${key}`,
      disabled: disabled(key),
    })
    input.value = (getPath(settings.current(), key) as string | null) ?? ''
    input.addEventListener('change', () => {
      const text = input.value.trim()
      void commit(patchFor(key, text === '' ? null : text)).then(render)
    })
    return input
  }

  function shortcutControl(): HTMLElement {
    const key = 'shortcuts.toggleWindow'
    const current = settings.current().shortcuts.toggleWindow
    const button = h(
      'button',
      { type: 'button', class: 'srecord', 'data-focus': 'set-record', disabled: disabled(key) },
      recording ? t('settings.recording') : t('settings.record'),
    )
    button.addEventListener('click', () => (recording ? stopRecording() : startRecording()))
    return h('span', { class: 'sshortcut' }, h('kbd', { class: 'skbd' }, current), button)
  }

  function startRecording() {
    recording = true
    inputGate.blocked = true
    errors.delete('shortcuts.toggleWindow')
    window.addEventListener('keydown', onRecordKey, true)
    render()
  }

  function stopRecording() {
    recording = false
    inputGate.blocked = false
    window.removeEventListener('keydown', onRecordKey, true)
    render()
  }

  function onRecordKey(event: KeyboardEvent) {
    event.preventDefault()
    event.stopPropagation()
    const result = acceleratorFromEvent(event)
    if (result.type === 'pending') return
    if (result.type === 'cancel') return stopRecording()
    if (result.type === 'invalid') {
      errors.set(
        'shortcuts.toggleWindow',
        t(result.reason === 'needsModifier' ? 'settings.needsModifier' : 'settings.unsupported'),
      )
      return render()
    }
    recording = false
    inputGate.blocked = false
    window.removeEventListener('keydown', onRecordKey, true)
    void commit(patchFor('shortcuts.toggleWindow', result.value), 'shortcuts.toggleWindow')
  }

  async function changeAutostart(checked: boolean) {
    autostart = await api.autostart.set(checked)
    render()
  }

  const statusOf = (id: string) => statuses.get(id) ?? { kind: 'none' as const }
  const storedAccount = (id: string) => settings.current().connections[id]

  async function loadConnections() {
    const [enabled, disabled] = await Promise.all([
      api.connections.list(),
      api.connections.disabled(),
    ])
    connectors = enabled
    disabledConnectors = disabled
    listed = true
    for (const { id } of connectors) statuses.set(id, 'checking')
    if (isOpen()) render()
    await Promise.all(
      connectors.map(async ({ id }) => {
        statuses.set(id, await api.connections.status(id))
        if (isOpen()) render()
      }),
    )
  }

  async function connect(connector: Connector) {
    const { id } = connector
    const draft = draftOf(id)
    const url = draft.url ?? storedAccount(id)?.url ?? ''
    const email = draft.email ?? storedAccount(id)?.email ?? ''
    const token = draft.token
    draft.token = ''
    statuses.set(id, 'checking')
    render()
    const fields = connector.connection.email ? { url, email } : { url }
    const status = await api.connections.connect(id, fields, token)
    statuses.set(id, status)
    if (status.kind === 'connected') drafts.delete(id)
    // Connected: the next thing to do is disconnect. Failed: type the token again, with the reason read out
    focusNext = status.kind === 'connected' ? `conn-${id}-disconnect` : `conn-${id}-token`
    render()
  }

  async function disconnect(id: string) {
    drafts.delete(id)
    statuses.set(id, await api.connections.disconnect(id))
    focusNext = `conn-${id}-url`
    render()
  }

  // Through the settings model, like any other setting: the host applies it with no restart
  async function enable(connector: DisabledConnector) {
    focusNext = `conn-${connector.id}-url`
    const disabled = settings.current().extensions.disabled
    await settings.update({
      extensions: { disabled: disabled.filter((id) => id !== connector.extension) },
    })
  }

  function statusText(status: ConnectionStatus | 'checking'): string {
    if (status === 'checking') return t('connections.checking')
    if (status.kind === 'connected')
      return t('connections.connectedAs', { user: status.user.username })
    if (status.kind === 'error') return t(connectionErrorKey(status.code))
    return t('connections.none')
  }

  // While checking the fields are read only, not disabled, so the one in use keeps the focus
  function textInput(focus: string, value: string, placeholder: string, busy: boolean) {
    const input = h('input', {
      type: 'text',
      spellcheck: 'false',
      autocomplete: 'off',
      placeholder,
      'data-focus': focus,
      readonly: busy,
    })
    input.value = value
    return input
  }

  // One section per connector, drawn from the fields it declares
  function connectorRows(connector: Connector): HTMLElement[] {
    const { id, connection } = connector
    const status = statusOf(id)
    const busy = status === 'checking'
    const draft = draftOf(id)
    const key = `connections.${id}`

    const urlInput = textInput(
      `conn-${id}-url`,
      draft.url ?? storedAccount(id)?.url ?? '',
      connection.address.placeholder,
      busy,
    )
    urlInput.addEventListener('input', () => {
      draft.url = urlInput.value
    })
    const emailInput = connection.email
      ? textInput(
          `conn-${id}-email`,
          draft.email ?? storedAccount(id)?.email ?? '',
          connection.email.placeholder,
          busy,
        )
      : undefined
    emailInput?.addEventListener('input', () => {
      draft.email = emailInput.value
    })

    const tokenInput = h('input', {
      type: 'password',
      spellcheck: 'false',
      autocomplete: 'off',
      placeholder: t('connections.token.placeholder'),
      'data-focus': `conn-${id}-token`,
      readonly: busy,
    })
    tokenInput.value = draft.token
    const statusId = `conn-${id}-status`
    if (status !== 'checking' && status.kind === 'error')
      tokenInput.setAttribute('aria-describedby', statusId)
    // While checking the button is busy rather than disabled, so it keeps the focus
    const connectButton = h(
      'button',
      {
        type: 'button',
        class: 'srecord',
        'data-focus': `conn-${id}-connect`,
        disabled: !busy && draft.token === '',
        'aria-disabled': busy ? 'true' : undefined,
        'aria-busy': busy ? 'true' : undefined,
      },
      t('connections.connect'),
    )
    tokenInput.addEventListener('input', () => {
      draft.token = tokenInput.value
      connectButton.disabled = draft.token.trim() === ''
    })
    tokenInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !busy && !connectButton.disabled) void connect(connector)
    })
    connectButton.addEventListener('click', () => {
      if (!busy) void connect(connector)
    })

    const connected = status !== 'checking' && status.kind === 'connected'
    const disconnectButton = connected
      ? h(
          'button',
          { type: 'button', class: 'srecord', 'data-focus': `conn-${id}-disconnect` },
          t('connections.disconnect'),
        )
      : undefined
    disconnectButton?.addEventListener('click', () => void disconnect(id))

    const state = status === 'checking' ? 'checking' : status.kind
    const statusLine = h(
      'span',
      { class: 'sconn-status', id: statusId, 'data-state': state, role: 'status' },
      statusText(status),
    )
    return [
      row(key, connector.name, statusLine, undefined, false),
      row(`${key}.url`, t('connections.url'), urlInput, undefined, false),
      emailInput && row(`${key}.email`, t('connections.email'), emailInput, undefined, false),
      row(`${key}.token`, t(connection.token.label), tokenInput, t(connection.token.hint), false),
      row(
        `${key}.actions`,
        '',
        h('span', { class: 'sconn-actions' }, connectButton, disconnectButton),
        undefined,
        false,
      ),
    ].filter((element) => element !== undefined)
  }

  // One compact row per disabled connector; disabling stays in the CLI, where it is rare
  function disabledRow(connector: DisabledConnector): HTMLElement {
    const button = h(
      'button',
      { type: 'button', class: 'srecord', 'data-focus': `conn-${connector.id}-enable` },
      t('connections.enable'),
    )
    button.addEventListener('click', () => void enable(connector))
    return row(
      `connections.${connector.id}.enable`,
      `${connector.name} · ${t('connections.disabled')}`,
      button,
      undefined,
      false,
    )
  }

  function connectionGroups(): Node[] {
    if (!listed) return []
    const sections = connectors.map((connector) => group(undefined, ...connectorRows(connector)))
    if (disabledConnectors.length > 0)
      sections.push(group(undefined, ...disabledConnectors.map(disabledRow)))
    if (sections.length === 0)
      sections.push(
        group(
          undefined,
          h('div', { class: 'srow2' }, h('span', { class: 'shint' }, t('connections.empty'))),
        ),
      )
    return sections
  }

  function header(): HTMLElement {
    return h(
      'header',
      { class: 'shead2' },
      h('h1', {}, t('settings.title')),
      closeButton(t, closeView, 'set-close'),
    )
  }

  function selectTab(id: TabId, focus = false) {
    focusNext = undefined
    activeTab = id
    confirmingReset = false
    render()
    if (focus) body.querySelector<HTMLElement>(`#settings-tab-${id}`)?.focus()
  }

  function tabList(): HTMLElement {
    const list = h('div', {
      class: 'snav',
      role: 'tablist',
      'aria-orientation': 'vertical',
      'aria-label': t('settings.tabs'),
    })
    for (const tab of TABS) {
      const selected = tab.id === activeTab
      const button = h(
        'button',
        {
          type: 'button',
          class: 'snav-item',
          role: 'tab',
          id: `settings-tab-${tab.id}`,
          'aria-selected': String(selected),
          'aria-controls': 'settings-panel',
          tabindex: selected ? '0' : '-1',
          'data-focus': `set-tab-${tab.id}`,
        },
        t(tab.label),
      )
      button.addEventListener('click', () => selectTab(tab.id))
      list.append(button)
    }
    list.addEventListener('keydown', (event) => {
      const index = TABS.findIndex((tab) => tab.id === activeTab)
      const last = TABS.length - 1
      const next =
        event.key === 'ArrowDown'
          ? index === last
            ? 0
            : index + 1
          : event.key === 'ArrowUp'
            ? index === 0
              ? last
              : index - 1
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? last
                : undefined
      if (next === undefined) return
      event.preventDefault()
      selectTab(TABS[next]?.id ?? activeTab, true)
    })
    return list
  }

  const group = (title: string | undefined, ...rows: Child[]) =>
    h('section', { class: 'sgroup' }, title && h('h2', {}, title), ...rows)

  function render() {
    const pending = focusNext
    const focused = pending ?? document.activeElement?.getAttribute('data-focus')
    focusNext = undefined
    const value = settings.current()
    const holdOptions = HOLD_TRIGGERS.map(
      (id) => [id, t(`settings.holdTrigger.${id}` as const)] as const,
    )

    const resetAll = h(
      'button',
      {
        type: 'button',
        class: 'sreset-all',
        'data-focus': 'set-reset-all',
        'data-confirming': confirmingReset ? 'true' : undefined,
      },
      confirmingReset ? t('settings.resetAllConfirm') : t('settings.resetAll'),
    )
    resetAll.addEventListener('click', () => {
      if (!confirmingReset) {
        confirmingReset = true
        return render()
      }
      confirmingReset = false
      // Left out: a reset must not disconnect an account or turn a disabled extension back on
      void commit(
        { ...defaultSettings, connections: undefined, extensions: undefined } as SettingsPatch,
        'shortcuts.toggleWindow',
      ).then(render)
    })

    const panels: Record<TabId, Node[]> = {
      general: [
        group(
          t('settings.language'),
          row(
            'language',
            t('settings.language'),
            select('language', [
              ['auto', t('settings.language.auto')],
              ['pt-BR', t('settings.language.pt')],
              ['en', t('settings.language.en')],
            ]),
          ),
        ),
        group(
          t('settings.group.appearance'),
          row(
            'theme',
            t('settings.theme'),
            select('theme', [
              ['dark', t('settings.theme.dark')],
              ['light', t('settings.theme.light')],
              ['system', t('settings.theme.system')],
            ]),
          ),
          row(
            'opacity',
            t('settings.opacity'),
            percent('opacity', LIMITS.opacity, (fraction) => deps.previewOpacity(fraction)),
          ),
          row(
            'fontSize',
            t('settings.fontSize'),
            number('fontSize', LIMITS.fontSize.min, LIMITS.fontSize.max, 'px'),
          ),
        ),
        group(
          t('settings.group.window'),
          row(
            'window.heightRatio',
            t('settings.heightRatio'),
            percent('window.heightRatio', LIMITS.heightRatio),
            t('settings.heightRatio.hint'),
          ),
          row(
            'window.panelOnFullHeight',
            t('settings.panelOnFullHeight'),
            checkbox('window.panelOnFullHeight'),
          ),
        ),
      ],
      shortcuts: [
        group(
          undefined,
          row(
            'shortcuts.toggleWindow',
            t('settings.toggleWindow'),
            shortcutControl(),
            t('settings.toggleWindow.hint'),
          ),
          row(
            'shortcuts.holdTrigger',
            t('settings.holdTrigger'),
            select('shortcuts.holdTrigger', holdOptions),
          ),
        ),
        h(
          'section',
          { class: 'sgroup' },
          h('h2', {}, t('settings.group.reference')),
          ...REFERENCE.map(([label, keys]) =>
            h(
              'div',
              { class: 'sref' },
              h('span', {}, t(label as never)),
              h('kbd', { class: 'skbd' }, keys),
            ),
          ),
        ),
      ],
      projects: [
        group(
          undefined,
          row('projects.root', t('settings.projectsRoot'), rootInput()),
          row(
            'projects.depth',
            t('settings.depth'),
            number('projects.depth', LIMITS.depth.min, LIMITS.depth.max),
            t('settings.depth.hint'),
          ),
        ),
      ],
      connections: connectionGroups(),
      system: [
        group(
          undefined,
          row(
            'autostart',
            t('settings.autostart'),
            checkbox('autostart', (checked) => void changeAutostart(checked), autostart),
          ),
          row(
            'system.notifyAfterSeconds',
            t('settings.notifyAfter'),
            number(
              'system.notifyAfterSeconds',
              LIMITS.notifyAfterSeconds.min,
              LIMITS.notifyAfterSeconds.max,
              t('settings.notifyAfter.unit'),
            ),
          ),
          row(
            'system.agentConnectHint',
            t('settings.agentConnectHint'),
            checkbox('system.agentConnectHint'),
            t('settings.agentConnectHint.hint'),
          ),
        ),
        group(
          undefined,
          h(
            'div',
            { class: 'srow2' },
            h('span', { class: 'shint' }, t('settings.resetAll.hint')),
            h('div', { class: 'scontrol' }, resetAll),
          ),
        ),
      ],
    }

    body.replaceChildren(
      header(),
      h(
        'div',
        { class: 'sbody' },
        tabList(),
        h(
          'div',
          {
            class: 'spanel scroll scroll-edges',
            role: 'tabpanel',
            id: 'settings-panel',
            'aria-labelledby': `settings-tab-${activeTab}`,
          },
          ...panels[activeTab],
        ),
      ),
    )
    void value
    const target = focused ? body.querySelector<HTMLElement>(`[data-focus="${focused}"]`) : null
    target?.focus()
    // A target that cannot take the focus yet (a connector still loading) gets it on the next drawing
    if (pending !== undefined && document.activeElement !== target) focusNext = pending
  }

  function open(tab: TabId = TABS[0].id) {
    confirmingReset = false
    activeTab = tab
    errors.clear()
    overlay.classList.add('open')
    render()
    body.querySelector<HTMLElement>('.snav-item[aria-selected="true"]')?.focus()
    void loadConnections()
    void api.autostart.isEnabled().then((on) => {
      autostart = on
      if (isOpen()) render()
    })
  }

  function closeView() {
    focusNext = undefined
    if (recording) stopRecording()
    drafts.clear()
    overlay.classList.remove('open')
    deps.onClose()
  }

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !recording) {
      event.preventDefault()
      event.stopPropagation()
      closeView()
    }
  })
  // On the document so a Tab pressed after a click on plain text, with the focus on the body, is caught too
  document.addEventListener('keydown', (event) => {
    if (isOpen()) trapFocus(overlay, event)
  })
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closeView()
  })

  // A change coming from outside (opacity shortcut, elsewhere) updates the open screen
  settings.onChange((_settings, changed) => {
    if (!isOpen()) return
    // `dck ext enable|disable` adds or removes a connector while the screen is open
    if (changed.includes('extensions.disabled')) void loadConnections()
    else if (local === 0) render()
  })

  return {
    open,
    close: closeView,
    isOpen,
    // After switching language, rebuilds the open screen with the new texts
    rerender: () => (isOpen() ? render() : undefined),
    toggle: () => (isOpen() ? closeView() : open()),
  }
}
