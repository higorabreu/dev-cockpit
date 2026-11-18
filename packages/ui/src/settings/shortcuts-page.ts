import {
  acceleratorFromEvent,
  chordFromEvent,
  type HoldTrigger,
  holdTriggerProblem,
  isShellChord,
  type MessageKey,
  mouseTrigger,
  type SettingsPatch,
  type SettingsUpdate,
  type ShortcutId,
  type Translator,
} from '@dck/core'
import { keyCap, keys as keyCaps } from '../kit/keys.ts'
import { h } from '../panel/dom.ts'
import { inputGate } from '../platform/input-gate.ts'
import type { Keymap } from '../platform/keymap.ts'
import { type KeySlot, type KeySlots, place, type SlotValue } from './key-slots.ts'
import type { SettingsClient } from './settings-client.ts'
import { triggerLabel } from './trigger-label.ts'

type Child = Node | string | false | undefined

export interface ShortcutsPageContext {
  readonly settings: SettingsClient
  readonly keymap: Keymap
  readonly i18n: Translator
  // Per setting key, shown under the row's name: a recording's refusal, and a calmer note
  readonly errors: Map<string, string>
  readonly notes: Map<string, string>
  row(key: string, label: string, control: Child, hint?: string): HTMLElement
  labelId(key: string): string
  disabled(key: string): boolean
  commit(patch: SettingsPatch, errorKey?: string): Promise<SettingsUpdate>
  render(): void
  // Where the next drawing puts the focus, by `data-focus`
  focusNext(target: string): void
}

// The actions in the order the page lists them, under the group of the settings they belong with
const GROUPS: ReadonlyArray<readonly [MessageKey, readonly ShortcutId[]]> = [
  ['menu.cat.tabs', ['newTab', 'closeTab', 'renameTab', 'nextTab', 'previousTab', 'clearTerminal']],
  ['settings.group.review', ['review', 'reviewLayout', 'reviewSend']],
  ['settings.group.window', ['projects', 'views', 'panel', 'settings', 'fullHeight']],
  [
    'settings.group.appearance',
    ['theme', 'opacityUp', 'opacityDown', 'fontBigger', 'fontSmaller', 'fontReset'],
  ],
]

const ACTION_LABELS: Readonly<Record<ShortcutId, MessageKey>> = {
  newTab: 'tabs.new',
  closeTab: 'tabs.close',
  renameTab: 'tabs.rename',
  nextTab: 'tabs.next',
  previousTab: 'tabs.previous',
  clearTerminal: 'terminal.clear',
  review: 'review.toggle',
  reviewLayout: 'review.layout.toggle',
  reviewSend: 'review.send',
  projects: 'projects.search',
  views: 'views.open',
  panel: 'menu.system.panel',
  settings: 'settings.ref.settings',
  theme: 'menu.system.theme',
  fullHeight: 'menu.system.fullHeight',
  opacityUp: 'settings.ref.opacityUp',
  opacityDown: 'settings.ref.opacityDown',
  fontBigger: 'settings.ref.fontBigger',
  fontSmaller: 'settings.ref.fontSmaller',
  fontReset: 'settings.ref.fontReset',
}

const settingKey = (slot: KeySlot) =>
  slot === 'toggleWindow' || slot === 'holdTrigger' ? `shortcuts.${slot}` : `shortcuts.keys.${slot}`

const focusId = (slot: KeySlot) =>
  slot === 'toggleWindow' ? 'set-record' : slot === 'holdTrigger' ? 'set-hold' : `set-key-${slot}`

const HOLD_REFUSALS: Readonly<Record<string, MessageKey>> = {
  terminalKey: 'settings.holdTrigger.terminalKey',
  mainButton: 'settings.holdTrigger.mainButton',
  unknown: 'settings.holdTrigger.unknown',
}

const consume = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

type Recorded =
  | { readonly kind: 'value'; readonly value: SlotValue }
  | { readonly kind: 'pending' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'refused'; readonly text: MessageKey }

// A chord recorded and held back because another slot answers to it, until Swap or Cancel
interface Pending {
  readonly slot: KeySlot
  readonly value: SlotValue
  readonly owner: KeySlot
  readonly swap?: SettingsPatch
}

// The Shortcuts page: the global key, the hold menu key and one row per interface action, each recorded
// in place (D69)
export function createShortcutsPage(ctx: ShortcutsPageContext) {
  const { settings, keymap } = ctx
  const t = ctx.i18n.t
  const mac = keymap.keyboard === 'mac'
  let recording: KeySlot | undefined
  let pending: Pending | undefined

  const slots = (): KeySlots => ({
    keymap,
    toggleWindow: settings.current().shortcuts.toggleWindow,
    holdTrigger: settings.current().shortcuts.holdTrigger ?? keymap.holdTrigger,
  })

  const slotName = (slot: KeySlot) =>
    slot === 'toggleWindow'
      ? t('settings.toggleWindow')
      : slot === 'holdTrigger'
        ? t('settings.holdTrigger')
        : t(ACTION_LABELS[slot])

  // A cap for a key and for a mouse button alike, so the row reads the same whatever the trigger is
  function triggerView(code: HoldTrigger): HTMLElement {
    const name = triggerLabel(code, keymap.keyboard, t)
    return keyCap(name)
  }

  function valueView(value: SlotValue): HTMLElement {
    if (value.kind === 'chord') return keyCaps(keymap.chordLabel(value.chord))
    if (value.kind === 'accelerator') return keyCaps(keymap.accelerator(value.text))
    return triggerView(value.code)
  }

  function listen(on: boolean) {
    inputGate.blocked = on
    if (on) {
      window.addEventListener('keydown', onKey, true)
      window.addEventListener('mousedown', onMouseDown, true)
      window.addEventListener('contextmenu', onContextMenu, true)
      window.addEventListener('click', onClickAway, true)
    } else {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('contextmenu', onContextMenu, true)
      window.removeEventListener('click', onClickAway, true)
    }
  }

  function start(slot: KeySlot) {
    pending = undefined
    recording = slot
    ctx.errors.delete(settingKey(slot))
    listen(true)
    ctx.render()
  }

  // A refusal belongs to the recording: it goes with it
  function finish() {
    if (recording !== undefined) ctx.errors.delete(settingKey(recording))
    recording = undefined
    listen(false)
  }

  function stop() {
    if (recording === undefined) return
    finish()
    ctx.render()
  }

  // A click anywhere else ends the recording and goes on to what it was for
  function onClickAway(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('[data-recording]')) return
    stop()
  }

  function fromEvent(slot: KeySlot, event: KeyboardEvent): Recorded {
    if (slot === 'holdTrigger') {
      if (event.key === 'Escape') return { kind: 'cancel' }
      const problem = holdTriggerProblem(event.code)
      if (problem)
        return { kind: 'refused', text: HOLD_REFUSALS[problem] ?? 'settings.holdTrigger.unknown' }
      return { kind: 'value', value: { kind: 'trigger', code: event.code } }
    }
    if (slot === 'toggleWindow') {
      const result = acceleratorFromEvent(event)
      if (result.type === 'accelerator')
        return { kind: 'value', value: { kind: 'accelerator', text: result.value } }
      if (result.type === 'invalid') {
        const modifier = mac ? 'settings.needsModifier.mac' : 'settings.needsModifier'
        const text = result.reason === 'unsupported' ? 'settings.unsupported' : modifier
        return { kind: 'refused', text }
      }
      return { kind: result.type }
    }
    const result = chordFromEvent(event)
    if (result.type === 'chord')
      return { kind: 'value', value: { kind: 'chord', chord: result.chord } }
    if (result.type === 'invalid') {
      const modifier = mac ? 'settings.needsModifier.app.mac' : 'settings.needsModifier.app'
      const text = result.reason === 'unsupported' ? 'settings.shortcut.unsupported' : modifier
      return { kind: 'refused', text }
    }
    return { kind: result.type }
  }

  function onKey(event: KeyboardEvent) {
    const slot = recording
    if (slot === undefined) return
    event.preventDefault()
    event.stopPropagation()
    const recorded = fromEvent(slot, event)
    if (recorded.kind === 'pending') return
    if (recorded.kind === 'cancel') return stop()
    if (recorded.kind === 'refused') {
      ctx.errors.set(settingKey(slot), t(recorded.text))
      return ctx.render()
    }
    finish()
    decide(slot, recorded.value)
  }

  // While the hold menu's trigger records, the middle, back and forward buttons are taken wherever they
  // are pressed; the left and the right buttons are refused on the recorder and work elsewhere
  function onMouseDown(event: MouseEvent) {
    if (recording !== 'holdTrigger') return
    const code = mouseTrigger(event.button)
    const onRecorder = event.target instanceof Element && event.target.closest('[data-recording]')
    if (holdTriggerProblem(code) === undefined) {
      consume(event)
      swallowRelease(event.button)
      finish()
      return decide('holdTrigger', { kind: 'trigger', code })
    }
    if (!onRecorder && event.button === 0) return
    consume(event)
    ctx.errors.set(settingKey('holdTrigger'), t('settings.holdTrigger.mainButton'))
    ctx.render()
  }

  function onContextMenu(event: MouseEvent) {
    if (recording === 'holdTrigger') consume(event)
  }

  // The rest of a click that was recorded reaches nothing, as a trigger's own click would not
  function swallowRelease(button: number) {
    const swallow = (event: MouseEvent) => {
      if (event.button === button) consume(event)
    }
    for (const type of ['mouseup', 'click', 'auxclick'] as const)
      window.addEventListener(type, swallow, { capture: true })
    window.addEventListener(
      'mouseup',
      () => {
        setTimeout(() => {
          for (const type of ['mouseup', 'click', 'auxclick'] as const)
            window.removeEventListener(type, swallow, { capture: true })
        })
      },
      { capture: true, once: true },
    )
  }

  // The global key can be refused by the system: its error then shows on its row
  const errorKey = (patch: SettingsPatch) =>
    patch.shortcuts?.toggleWindow === undefined ? undefined : 'shortcuts.toggleWindow'

  function save(slot: KeySlot, patch: SettingsPatch) {
    ctx.focusNext(focusId(slot))
    void ctx.commit(patch, errorKey(patch)).then(() => ctx.render())
  }

  function decide(slot: KeySlot, value: SlotValue) {
    const placement = place(slots(), slot, value)
    if (placement.kind === 'same') return ctx.render()
    if (placement.kind === 'save') return save(slot, placement.patch)
    pending = { slot, value, owner: placement.owner, swap: placement.swap }
    ctx.focusNext(placement.swap ? 'set-key-swap' : 'set-key-cancel')
    ctx.render()
  }

  function cancelPending() {
    const slot = pending?.slot
    pending = undefined
    if (slot !== undefined) ctx.focusNext(focusId(slot))
    ctx.render()
  }

  // The recorded key with Swap and Cancel, in place of the row's own control
  function pendingControl(held: Pending): HTMLElement {
    const swap =
      held.swap &&
      h(
        'button',
        { type: 'button', class: 'srecord', 'data-focus': 'set-key-swap' },
        t('settings.shortcut.swap'),
      )
    swap?.addEventListener('click', () => {
      pending = undefined
      if (held.swap) save(held.slot, held.swap)
    })
    const cancel = h(
      'button',
      { type: 'button', class: 'srecord', 'data-focus': 'set-key-cancel' },
      t('settings.shortcut.cancel'),
    )
    cancel.addEventListener('click', cancelPending)
    return h('span', { class: 'sshortcut' }, valueView(held.value), swap, cancel)
  }

  // Under the row's name: the key another slot holds, or a custom key the shell no longer gets
  function noteFor(slot: KeySlot) {
    const key = settingKey(slot)
    const custom = slot !== 'toggleWindow' && slot !== 'holdTrigger' && keymap.isCustom(slot)
    const chord = custom ? keymap.chords(slot)[0] : undefined
    if (pending?.slot === slot)
      ctx.notes.set(key, t('settings.shortcut.used', { action: slotName(pending.owner) }))
    else if (chord && isShellChord(chord, keymap.keyboard))
      ctx.notes.set(key, t('settings.shortcut.shell', { key: keymap.chordLabel(chord) }))
    else ctx.notes.delete(key)
  }

  function globalRow(): HTMLElement {
    const slot = 'toggleWindow'
    const key = settingKey(slot)
    noteFor(slot)
    const button = h(
      'button',
      {
        type: 'button',
        class: 'srecord',
        'data-focus': focusId(slot),
        'data-recording': recording === slot ? 'true' : undefined,
        disabled: ctx.disabled(key),
      },
      recording === slot ? t('settings.recording') : t('settings.record'),
    )
    button.addEventListener('click', () => (recording === slot ? stop() : start(slot)))
    const current = settings.current().shortcuts.toggleWindow
    const control =
      pending?.slot === slot
        ? pendingControl(pending)
        : h('span', { class: 'sshortcut' }, keyCaps(keymap.accelerator(current)), button)
    return ctx.row(
      key,
      t('settings.toggleWindow'),
      control,
      t(mac ? 'settings.toggleWindow.hint.mac' : 'settings.toggleWindow.hint'),
    )
  }

  // The hold menu's key or mouse button: shown as a cap or a name, with Change beside it like the global key
  function holdRow(): HTMLElement {
    const slot = 'holdTrigger'
    const key = settingKey(slot)
    noteFor(slot)
    const active = recording === slot
    const button = h(
      'button',
      {
        type: 'button',
        class: 'srecord',
        'data-focus': focusId(slot),
        'data-recording': active ? 'true' : undefined,
        disabled: ctx.disabled(key),
      },
      active ? t('settings.holdTrigger.recording') : t('settings.record'),
    )
    // A left click on the recorder is refused by the mousedown; only a click outside a recording starts one
    button.addEventListener('click', () => {
      if (!active) start(slot)
    })
    // While it records, the prompt stands alone: beside the cap it would push the row's name onto more lines
    const control =
      pending?.slot === slot
        ? pendingControl(pending)
        : h('span', { class: 'sshortcut' }, !active && triggerView(slots().holdTrigger), button)
    return ctx.row(key, t('settings.holdTrigger'), control)
  }

  // The action's keycaps are its button: a click or Enter records the next chord in their place
  function actionRow(id: ShortcutId): HTMLElement {
    const key = settingKey(id)
    noteFor(id)
    const active = recording === id
    const buttonId = focusId(id)
    const button = h(
      'button',
      {
        type: 'button',
        class: 'skey',
        id: buttonId,
        'data-focus': buttonId,
        'data-recording': active ? 'true' : undefined,
        'data-tip': active ? undefined : t('settings.record'),
        'aria-labelledby': `${ctx.labelId(key)} ${buttonId}`,
        disabled: ctx.disabled(key),
      },
      active
        ? h('span', { class: 'skey-wait' }, t('settings.recording'))
        : keyCaps(keymap.label(id)),
    )
    button.addEventListener('click', () => (recording === id ? stop() : start(id)))
    return ctx.row(
      key,
      t(ACTION_LABELS[id]),
      pending?.slot === id ? pendingControl(pending) : button,
    )
  }

  return {
    groups(): HTMLElement[] {
      return [
        h('section', { class: 'sgroup skeys' }, globalRow(), holdRow()),
        ...GROUPS.map(([title, ids]) =>
          h(
            'section',
            { class: 'sgroup skeys skeys-list' },
            h('h2', {}, t(title)),
            ...ids.map(actionRow),
          ),
        ),
      ]
    },
    // True while a recording or a held-back key is on screen, so Esc does not close the screen
    busy: () => recording !== undefined || pending !== undefined,
    // Esc with a key held back cancels it; true when it did
    escape(): boolean {
      if (pending === undefined) return false
      cancelPending()
      return true
    },
    // The screen closes or every setting goes back to its default: nothing stays recorded or held
    reset() {
      pending = undefined
      if (recording !== undefined) finish()
    },
  }
}
