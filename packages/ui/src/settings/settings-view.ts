import {
  acceleratorFromEvent,
  type ConnectionStatus,
  type Connector,
  connectedFirst,
  connectionErrorKey,
  type DisabledConnector,
  defaultSettings,
  HOLD_TRIGGERS,
  type HostApi,
  LIMITS,
  type MessageKey,
  noSystemFonts,
  type Settings,
  type SettingsIssue,
  type SettingsPatch,
  type SystemFontsInfo,
  type Translator,
  terminalFamily,
} from '@dck/core'
import { trapFocus } from '../kit/focus-trap.ts'
import { keys as keyCaps } from '../kit/keys.ts'
import { closeButton } from '../kit/panel-frame.ts'
import { createSelect } from '../kit/select.ts'
import { h, icon } from '../panel/dom.ts'
import { inputGate } from '../platform/input-gate.ts'
import type { Keymap } from '../platform/keymap.ts'
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

const reference = (keymap: Keymap): ReadonlyArray<readonly [string, string]> => [
  ['tabs.new', keymap.label('newTab')],
  ['tabs.close', keymap.label('closeTab')],
  ['tabs.next', keymap.label('nextTab')],
  ['tabs.previous', keymap.label('previousTab')],
  ['terminal.clear', keymap.label('clearTerminal')],
  ['projects.search', keymap.label('projects')],
  ['views.open', keymap.label('views')],
  ['menu.system.panel', keymap.label('panel')],
  ['menu.system.theme', keymap.label('theme')],
  ['menu.system.fullHeight', keymap.label('fullHeight')],
  ['settings.ref.opacity', `${keymap.label('opacityUp')} ↓`],
  // The modifier with the three keys after it, which the caps show as one chord and two alternatives
  [
    'settings.ref.font',
    `${keymap.modifiers('fontBigger')}${keymap.keyboard === 'mac' ? '' : '+'}= − 0`,
  ],
  ['settings.ref.settings', keymap.label('settings')],
]

// The shipped fonts are registered as variable fonts; the screen names them as the user knows them
const shownFamily = (family: string) => family.replace(/ Variable$/, '')

const WARNING = '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/>'

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
    readonly keymap: Keymap
  },
) {
  const { overlay, body } = elements
  const { settings, api, i18n } = deps
  const mac = deps.keymap.keyboard === 'mac'
  const needsModifier = mac ? 'settings.needsModifier.mac' : 'settings.needsModifier'
  const t = i18n.t
  let recording = false
  let autostart = false
  // The fonts installed, asked for each time the screen opens so a font installed since then shows up
  let fonts: SystemFontsInfo = noSystemFonts
  let confirmingReset = false
  // The last "Open the settings file" found no app to open it; cleared when the screen opens again
  let openFailed = false
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
  // The connectors whose token permissions the user unfolded, kept across redraws
  const openPermissions = new Set<string>()
  const draftOf = (id: string) => {
    const found = drafts.get(id) ?? { token: '' }
    drafts.set(id, found)
    return found
  }
  // Error message per key, shown beside its control
  const errors = new Map<string, string>()
  // A calmer word beside a control, such as a typed value that was adjusted to fit
  const notes = new Map<string, string>()
  // Changes made here need not redraw everything: the control already has the right value
  let local = 0

  const isOpen = () => overlay.classList.contains('open')

  async function commit(patch: SettingsPatch, errorKey?: string) {
    local += 1
    const fileBefore = settings.file()
    let redraw = errorKey !== undefined
    try {
      const result = await settings.update(patch)
      if (errorKey) {
        if (result.rejected.length > 0) errors.set(errorKey, t('settings.shortcutRefused'))
        else errors.delete(errorKey)
      }
      // A refused change (the file is broken) puts the controls back to the values in use
      if (result.rejected.length > 0) redraw = true
      return result
    } finally {
      local -= 1
      if (redraw || settings.file() !== fileBefore) render()
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
    button.hidden = !resettable(key)
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
      button.hidden = !resettable(button.dataset.key ?? '')
    }
  }

  // A value the file holds wrongly can be put right by the reset, even when the one in use is the default
  const resettable = (key: string) =>
    (differs(key, settings.current()) || issueOf(key) !== undefined) &&
    !settings.locked().includes(key) &&
    !fileBroken()

  const labelId = (key: string) => `set-label-${key.replace(/\./g, '-')}`

  function row(
    key: string,
    label: string,
    control: Child,
    hint?: string,
    resettable = true,
    // Shown under the hint, such as a disclosure with more detail
    more?: Child,
  ): HTMLElement {
    const locked = settings.locked().includes(key)
    const error = errors.get(key)
    const note = notes.get(key) ?? fileNote(key)
    return h(
      'div',
      { class: 'srow2', 'data-setting': key, 'data-locked': locked ? 'true' : undefined },
      h(
        'div',
        { class: 'slabel' },
        h('span', { class: 'sname2', id: labelId(key) }, label),
        (locked ? t('settings.locked') : hint) &&
          h('span', { class: 'shint' }, locked ? t('settings.locked') : (hint ?? '')),
        error && h('span', { class: 'serror', role: 'alert' }, error),
        note && h('span', { class: 'snote', role: 'status' }, note),
        more,
      ),
      h('div', { class: 'scontrol' }, control, resettable && resetButton(key)),
    )
  }

  // While settings.json is broken nothing can be saved, so no control pretends it can
  const fileBroken = () => settings.file().kind === 'invalid'
  const disabled = (key: string) => settings.locked().includes(key) || fileBroken()

  // The value of settings.json not used as written for this setting, or one of its entries
  function issueOf(key: string): SettingsIssue | undefined {
    const file = settings.file()
    if (file.kind !== 'ok') return undefined
    return file.issues.find((issue) => issue.key === key || issue.key.startsWith(`${key}.`))
  }

  // A value that went back to its default says so: the file's form of it (1 for 100%, null for a font)
  // reads as a riddle beside the control
  const issueText = (issue: SettingsIssue) =>
    issue.kind === 'ignored' && issue.used === JSON.stringify(getPath(defaultSettings, issue.key))
      ? t('settings.issue.ignoredDefault')
      : t(`settings.issue.${issue.kind}`, { used: issue.used ?? '' })

  // What the file holds for this setting, told under its name, where it can be put right
  function fileNote(key: string): string | undefined {
    const issue = issueOf(key)
    if (!issue) return undefined
    if (issue.kind === 'missingFolder') return t('settings.projectsRoot.missing')
    return t('settings.file.rowNote', { found: issue.found, reason: issueText(issue) })
  }

  // Only when no app opened the file: the button alone gives no sign that nothing happened
  const openFailedText = () =>
    openFailed &&
    h('span', { class: 'sfile-failed', role: 'status' }, t('settings.file.openFailed'))

  // Above the page, only while the file cannot be read: nothing here saves until it is fixed
  function brokenStrip(): HTMLElement | false {
    const file = settings.file()
    if (file.kind !== 'invalid') return false
    const open = h(
      'button',
      { type: 'button', class: 'sbroken-open', 'data-focus': 'set-broken-open' },
      t('settings.file.openToFix'),
    )
    open.addEventListener('click', () => void openFile())
    return h(
      'div',
      { class: 'sbroken', role: 'status' },
      icon(WARNING, 14, 'sfile-warn'),
      h('p', {}, t('settings.file.invalid', file)),
      open,
    )
  }

  async function openFile() {
    openFailed = !(await settings.openFile())
    if (isOpen()) render()
  }

  // `current` stands in for a setting that is null until the user chooses it
  function select(
    key: string,
    options: ReadonlyArray<readonly [string, string]>,
    current = String(getPath(settings.current(), key)),
  ): HTMLElement {
    const control = createSelect({
      id: `set-${key.replace(/\./g, '-')}`,
      options: options.map(([value, label]) => ({ value, label })),
      value: current,
      labelledBy: labelId(key),
      disabled: disabled(key),
      onChange: (value) => void commit(patchFor(key, value)),
    })
    control.button.dataset.focus = `set-${key}`
    return control.element
  }

  // A font picker: the first option is the default (null in the file), then the installed families. A name
  // set by hand that is not installed stays listed, so the control never shows another font than the file's
  function fontSelect(key: string, families: readonly string[], fallback: string): HTMLElement {
    const chosen = getPath(settings.current(), key)
    const current = typeof chosen === 'string' ? chosen : ''
    const names = current && !families.includes(current) ? [current, ...families] : families
    const control = createSelect({
      id: `set-${key.replace(/\./g, '-')}`,
      options: [
        { value: '', label: fallback },
        ...names.map((name) => ({ value: name, label: name })),
      ],
      value: current,
      labelledBy: labelId(key),
      disabled: disabled(key),
      onChange: (value) => void commit(patchFor(key, value === '' ? null : value)),
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
      if (!Number.isFinite(parsed)) return
      void commit(patchFor(key, parsed)).then((result) => {
        // A value out of range is clamped: say so beside the field instead of changing it silently
        const used = getPath(result.settings, key)
        if (result.rejected.length === 0 && used !== parsed)
          notes.set(key, t('settings.adjusted', { value: String(used), min, max }))
        else notes.delete(key)
        render()
      })
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
    const choose = h(
      'button',
      {
        type: 'button',
        class: 'srecord',
        'data-focus': 'set-choose-root',
        disabled: disabled(key),
      },
      t('settings.projectsRoot.choose'),
    )
    choose.addEventListener('click', async () => {
      const root = await api.projects.chooseRoot()
      if (root !== undefined) void commit(patchFor(key, root)).then(render)
    })
    return h('span', { class: 'sfolder' }, input, choose)
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
    return h('span', { class: 'sshortcut' }, keyCaps(current), button)
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
        t(result.reason === 'unsupported' ? 'settings.unsupported' : needsModifier),
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
    // Ordered once per opening, so a section does not jump while the user connects or disconnects it
    connectors = connectedFirst(enabled, (id) => Boolean(storedAccount(id)?.url))
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

  // What a token needs, folded under its hint until asked for; it opens in place, so the focus stays on it
  function permissionsDisclosure(id: string, permissions: readonly MessageKey[]): HTMLElement {
    const listId = `conn-${id}-permissions-list`
    const open = openPermissions.has(id)
    const list = h(
      'ul',
      { class: 'sperms', id: listId, hidden: !open },
      ...permissions.map((key) => h('li', {}, t(key))),
    )
    const button = h(
      'button',
      {
        type: 'button',
        class: 'sdisclose',
        'data-focus': `conn-${id}-permissions`,
        'aria-expanded': String(open),
        'aria-controls': listId,
      },
      icon('<path d="M9 6l6 6-6 6"/>', 10, 'schev'),
      t('connections.permissions'),
    )
    button.addEventListener('click', () => {
      const now = !openPermissions.has(id)
      if (now) openPermissions.add(id)
      else openPermissions.delete(id)
      button.setAttribute('aria-expanded', String(now))
      list.hidden = !now
    })
    return h('div', { class: 'sdisclosure' }, button, list)
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
      row(
        `${key}.token`,
        t(connection.token.label),
        tokenInput,
        t(connection.token.hint),
        false,
        connection.token.permissions && permissionsDisclosure(id, connection.token.permissions),
      ),
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

  // Warnings mark the button with a dot and count in its tooltip; the detail is under each setting
  function fileButton(): HTMLElement {
    const file = settings.file()
    const warnings = file.kind === 'ok' ? file.issues.length : 0
    const tip =
      warnings > 0 ? i18n.plural('settings.file.openWarnings', warnings) : t('settings.file.open')
    const button = h(
      'button',
      {
        type: 'button',
        class: 'pclose sfile',
        'data-focus': 'set-open-file',
        'data-tip': tip,
        'aria-label': tip,
      },
      icon(
        '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M10 12l-1.5 2.5L10 17M14 12l1.5 2.5L14 17"/>',
        14,
      ),
      warnings > 0 && h('span', { class: 'sfile-dot', 'aria-hidden': 'true' }),
    )
    button.addEventListener('click', () => void openFile())
    return button
  }

  function header(): HTMLElement {
    return h(
      'header',
      { class: 'shead2' },
      h('h1', {}, t('settings.title')),
      h(
        'div',
        { class: 'shead-actions' },
        openFailedText(),
        fileButton(),
        closeButton(t, closeView, 'set-close'),
      ),
    )
  }

  function selectTab(id: TabId, focus = false) {
    focusNext = undefined
    activeTab = id
    confirmingReset = false
    render()
    if (focus) body.querySelector<HTMLElement>(`#settings-tab-${id}`)?.focus()
  }

  // The pages holding a setting the file got wrong, marked in the list so the user knows where to look
  function tabsWithIssues(panels: Record<TabId, Node[]>): ReadonlySet<TabId> {
    const marked = new Set<TabId>()
    for (const tab of TABS) {
      for (const node of panels[tab.id]) {
        if (!(node instanceof Element)) continue
        for (const row of node.querySelectorAll<HTMLElement>('[data-setting]')) {
          if (issueOf(row.dataset.setting ?? '')) marked.add(tab.id)
        }
      }
    }
    return marked
  }

  function tabList(marked: ReadonlySet<TabId>): HTMLElement {
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
          'aria-description': marked.has(tab.id) ? t('settings.file.tabHasIssue') : undefined,
        },
        t(tab.label),
        marked.has(tab.id) && h('span', { class: 'snav-mark', 'aria-hidden': 'true' }),
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
    const holdTrigger = value.shortcuts.holdTrigger ?? deps.keymap.holdTrigger
    // The desktop takes Super for itself on Linux and Windows; a value already in the file stays listed
    const holdOptions = HOLD_TRIGGERS.filter(
      (id) => mac || id !== 'MetaRight' || id === holdTrigger,
    ).map((id) => [id, t(`settings.holdTrigger.${mac ? 'mac.' : ''}${id}` as const)] as const)

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
            'appearance.fontFamily',
            t('settings.interfaceFont'),
            fontSelect(
              'appearance.fontFamily',
              fonts.families,
              t('settings.font.cockpit', { font: 'Inter' }),
            ),
          ),
          row(
            'appearance.codeFontFamily',
            t('settings.codeFont'),
            fontSelect(
              'appearance.codeFontFamily',
              fonts.monospaceFamilies,
              t('settings.font.cockpit', { font: 'JetBrains Mono' }),
            ),
            t('settings.codeFont.hint'),
          ),
        ),
        group(
          t('settings.group.terminal'),
          row(
            'terminal.fontFamily',
            t('settings.terminalFont'),
            fontSelect(
              'terminal.fontFamily',
              fonts.monospaceFamilies,
              t('settings.font.system', { font: shownFamily(terminalFamily(null, fonts)) }),
            ),
            t('settings.terminalFont.hint'),
          ),
          row(
            'fontSize',
            t('settings.fontSize'),
            number('fontSize', LIMITS.fontSize.min, LIMITS.fontSize.max, 'px'),
          ),
          row(
            'terminal.cursorStyle',
            t('settings.cursorStyle'),
            select('terminal.cursorStyle', [
              ['block', t('settings.cursorStyle.block')],
              ['bar', t('settings.cursorStyle.bar')],
              ['underline', t('settings.cursorStyle.underline')],
            ]),
          ),
          row('terminal.cursorBlink', t('settings.cursorBlink'), checkbox('terminal.cursorBlink')),
          // xterm reads the switch only on a Mac, so another keyboard has nothing to choose
          mac &&
            row(
              'terminal.macOptionAsMeta',
              t('settings.macOptionAsMeta'),
              select('terminal.macOptionAsMeta', [
                ['left', t('settings.macOptionAsMeta.left')],
                ['both', t('settings.macOptionAsMeta.both')],
                ['none', t('settings.macOptionAsMeta.none')],
              ]),
              t('settings.macOptionAsMeta.hint'),
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
          row(
            'window.restoreTabs',
            t('settings.restoreTabs'),
            checkbox('window.restoreTabs'),
            t('settings.restoreTabs.hint'),
          ),
        ),
        group(
          t('settings.group.review'),
          row(
            'review.layout',
            t('settings.reviewLayout'),
            select('review.layout', [
              ['auto', t('settings.reviewLayout.auto')],
              ['side', t('settings.reviewLayout.side')],
              ['stacked', t('settings.reviewLayout.stacked')],
            ]),
            t('settings.reviewLayout.hint'),
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
            select('shortcuts.holdTrigger', holdOptions, holdTrigger),
          ),
        ),
        h(
          'section',
          { class: 'sgroup' },
          h('h2', {}, t('settings.group.reference')),
          ...reference(deps.keymap).map(([label, keys]) =>
            h('div', { class: 'sref' }, h('span', {}, t(label as never)), keyCaps(keys)),
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
        tabList(tabsWithIssues(panels)),
        h(
          'div',
          { class: 'smain' },
          brokenStrip(),
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
    openFailed = false
    activeTab = tab
    errors.clear()
    notes.clear()
    overlay.classList.add('open')
    render()
    body.querySelector<HTMLElement>('.snav-item[aria-selected="true"]')?.focus()
    void loadConnections()
    void api.fonts.system().then((found) => {
      fonts = found
      if (isOpen()) render()
    })
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

  // The file was saved by hand: its errors and ignored values show at once
  settings.onFile(() => {
    if (isOpen() && local === 0) render()
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
