import {
  acceleratorFromEvent,
  defaultSettings,
  HOLD_TRIGGERS,
  type HostApi,
  LIMITS,
  type Settings,
  type SettingsPatch,
  type Translator,
} from '@dck/core'
import { inputGate } from './input-gate.ts'
import { h } from './panel/dom.ts'
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

// Monta o patch aninhado de uma chave com ponto: 'window.heightRatio' vira { window: { heightRatio } }
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
  ['tabs.nextFinished', 'Ctrl+Shift+J'],
  ['projects.search', 'Ctrl+Shift+O'],
  ['menu.system.panel', 'Ctrl+Shift+B'],
  ['menu.system.theme', 'Ctrl+Shift+L'],
  ['menu.system.fullHeight', 'F11'],
  ['settings.ref.opacity', 'Ctrl+Shift+↑ ↓'],
  ['settings.ref.font', 'Ctrl + − 0'],
  ['settings.ref.settings', 'Ctrl+,'],
]

export function createSettingsView(
  elements: SettingsViewElements,
  deps: {
    readonly settings: SettingsClient
    readonly api: HostApi
    readonly i18n: Translator
    onClose(): void
    // Mostra a opacidade enquanto o controle é arrastado, antes de gravar
    previewOpacity(value: number): void
  },
) {
  const { overlay, body } = elements
  const { settings, api, i18n } = deps
  const t = i18n.t
  let recording = false
  let autostart = false
  let confirmingReset = false
  // Mensagem de erro por chave, mostrada junto ao controle
  const errors = new Map<string, string>()
  // Mudanças feitas aqui não precisam redesenhar tudo: o controle já está no valor certo
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

  // Mostra ou esconde o "restaurar" de cada linha conforme o valor atual
  function refreshResets() {
    for (const button of body.querySelectorAll<HTMLElement>('.sreset')) {
      const key = button.dataset.key ?? ''
      button.hidden = !differs(key, settings.current()) || settings.locked().includes(key)
    }
  }

  function row(key: string, label: string, control: Child, hint?: string): HTMLElement {
    const locked = settings.locked().includes(key)
    const error = errors.get(key)
    return h(
      'div',
      { class: 'srow2', 'data-locked': locked ? 'true' : undefined },
      h(
        'div',
        { class: 'slabel' },
        h('span', { class: 'sname2' }, label),
        (locked ? t('settings.locked') : hint) &&
          h('span', { class: 'shint' }, locked ? t('settings.locked') : (hint ?? '')),
        error && h('span', { class: 'serror', role: 'alert' }, error),
      ),
      h('div', { class: 'scontrol' }, control, resetButton(key)),
    )
  }

  const disabled = (key: string) => settings.locked().includes(key)

  function select(
    key: string,
    options: ReadonlyArray<readonly [string, string]>,
  ): HTMLSelectElement {
    const element = h('select', { 'data-focus': `set-${key}`, disabled: disabled(key) })
    for (const [value, label] of options) {
      const option = h('option', { value }, label)
      option.selected = getPath(settings.current(), key) === value
      element.append(option)
    }
    element.addEventListener('change', () => void commit(patchFor(key, element.value)))
    return element
  }

  // O valor guardado é uma fração (0,6); a barra e o texto mostram porcentagem (60)
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

  const group = (title: string, ...rows: Child[]) =>
    h('section', { class: 'sgroup' }, h('h2', {}, title), ...rows)

  function render() {
    const focused = document.activeElement?.getAttribute('data-focus')
    const value = settings.current()
    const holdOptions = HOLD_TRIGGERS.map(
      (id) => [id, t(`settings.holdTrigger.${id}` as const)] as const,
    )

    const resetAll = h(
      'button',
      { type: 'button', class: 'sreset-all', 'data-focus': 'set-reset-all' },
      confirmingReset ? t('settings.resetAllConfirm') : t('settings.resetAll'),
    )
    resetAll.addEventListener('click', () => {
      if (!confirmingReset) {
        confirmingReset = true
        return render()
      }
      confirmingReset = false
      void commit(defaultSettings as SettingsPatch, 'shortcuts.toggleWindow').then(render)
    })

    body.replaceChildren(
      h(
        'header',
        { class: 'shead2' },
        h('h1', {}, t('settings.title')),
        h('span', {}, t('settings.close')),
      ),
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
          t('settings.language.note'),
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
      group(
        t('settings.group.shortcuts'),
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
      group(
        t('settings.group.projects'),
        row('projects.root', t('settings.projectsRoot'), rootInput()),
        row(
          'projects.depth',
          t('settings.depth'),
          number('projects.depth', LIMITS.depth.min, LIMITS.depth.max),
          t('settings.depth.hint'),
        ),
      ),
      group(
        t('settings.group.system'),
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
      h('footer', { class: 'sfoot' }, resetAll),
    )
    void value
    if (focused) body.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus()
  }

  function open() {
    confirmingReset = false
    errors.clear()
    overlay.classList.add('open')
    render()
    body.querySelector<HTMLElement>('select, input, button')?.focus()
    void api.autostart.isEnabled().then((on) => {
      autostart = on
      if (isOpen()) render()
    })
  }

  function close() {
    if (recording) stopRecording()
    overlay.classList.remove('open')
    deps.onClose()
  }

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !recording) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  })
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close()
  })

  // Mudança vinda de fora (atalho de opacidade, outro lugar) atualiza a tela aberta
  settings.onChange(() => {
    if (isOpen() && local === 0) render()
  })

  return { open, close, isOpen, toggle: () => (isOpen() ? close() : open()) }
}
