import {
  type Chord,
  type ChordModifiers,
  eventKey,
  formatChord,
  type HoldTrigger,
  type Keyboard,
  type KeyInput,
  matchesChord,
  parseChord,
  SHORTCUT_IDS,
  type ShortcutId,
} from '@dck/core'

export type { Keyboard, ShortcutId }

export const keyboardFor = (platform: string): Keyboard => (/^mac/i.test(platform) ? 'mac' : 'pc')

type Modifiers = ChordModifiers

const C = { ctrl: true } as const
const CS = { ctrl: true, shift: true } as const
const M = { meta: true } as const
const MS = { meta: true, shift: true } as const

// The first chord of each action is the one its label shows (D51)
type Chords = readonly [Chord, ...Chord[]]

const KEYMAPS: Record<Keyboard, Record<ShortcutId, Chords>> = {
  pc: {
    newTab: [{ ...CS, key: 't' }],
    closeTab: [{ ...CS, key: 'w' }],
    renameTab: [{ ...CS, key: 'r' }],
    nextTab: [
      { ...C, key: 'Tab' },
      { ...C, key: 'PageDown' },
    ],
    previousTab: [
      { ...CS, key: 'Tab' },
      { ...C, key: 'PageUp' },
    ],
    settings: [{ ...C, key: ',' }],
    review: [{ ...CS, key: 'd' }],
    reviewLayout: [{ ...CS, key: 'e' }],
    // Beside Ctrl+Enter, which saves one comment; Enter alone never leaves the cockpit for the shell
    reviewSend: [{ ...CS, key: 'Enter' }],
    theme: [{ ...CS, key: 'l' }],
    projects: [{ ...CS, key: 'p' }],
    views: [{ ...CS, key: 'm' }],
    panel: [{ ...CS, key: 'b' }],
    fullHeight: [{ key: 'F11' }],
    opacityUp: [{ ...CS, key: 'ArrowUp' }],
    opacityDown: [{ ...CS, key: 'ArrowDown' }],
    fontBigger: [
      { ...C, key: '=' },
      { ...C, key: '+' },
      { ...CS, key: '+' },
    ],
    fontSmaller: [{ ...C, key: '-' }],
    fontReset: [{ ...C, key: '0' }],
    clearTerminal: [{ ...CS, key: 'k' }],
  },
  // Cmd where Terminal.app and VS Code use it, so Ctrl stays with the shell
  mac: {
    newTab: [{ ...M, key: 't' }],
    closeTab: [{ ...M, key: 'w' }],
    renameTab: [{ ...MS, key: 'r' }],
    // Shift turns the bracket into a brace in event.key on some layouts
    nextTab: [
      { ...C, key: 'Tab' },
      { ...MS, key: ']' },
      { ...MS, key: '}' },
    ],
    previousTab: [
      { ...CS, key: 'Tab' },
      { ...MS, key: '[' },
      { ...MS, key: '{' },
    ],
    settings: [{ ...M, key: ',' }],
    review: [{ ...MS, key: 'd' }],
    reviewLayout: [{ ...MS, key: 'e' }],
    reviewSend: [{ ...MS, key: 'Enter' }],
    theme: [{ ...MS, key: 'l' }],
    projects: [{ ...MS, key: 'p' }],
    views: [{ ...MS, key: 'm' }],
    panel: [{ ...MS, key: 'b' }],
    // F11 shows the desktop on a Mac; Ctrl+Cmd+F is its full screen key
    fullHeight: [{ ctrl: true, meta: true, key: 'f' }],
    opacityUp: [{ ...MS, key: 'ArrowUp' }],
    opacityDown: [{ ...MS, key: 'ArrowDown' }],
    fontBigger: [
      { ...M, key: '=' },
      { ...M, key: '+' },
      { ...MS, key: '+' },
    ],
    fontSmaller: [{ ...M, key: '-' }],
    fontReset: [{ ...M, key: '0' }],
    // Terminal.app, iTerm2 and VS Code clear with Cmd+K
    clearTerminal: [{ ...M, key: 'k' }],
  },
}

// Copy and paste in the terminal; on the Mac the Edit menu gives ⌘C and ⌘V and Ctrl stays with the shell
const CLIPBOARD: Record<Keyboard, Partial<Record<'copy' | 'paste', Chord>>> = {
  pc: { copy: { ...CS, key: 'c' }, paste: { ...CS, key: 'v' } },
  mac: {},
}

// The modifier of a key inside a panel and of a click on a link or a path; Ctrl+click is the Mac's
// secondary click, so its terminals open links with Cmd
const PRIMARY: Record<Keyboard, Modifiers> = { pc: C, mac: M }
// The modifier of the digits that go to a tab; 9 goes to the last one, as in browsers and Ghostty
const TAB: Record<Keyboard, Modifiers> = { pc: { alt: true }, mac: M }
// MacBook keyboards have no right Control; the right Command sits near that corner, never types text and
// leaves both Options to the terminal
const HOLD_TRIGGER: Record<Keyboard, HoldTrigger> = { pc: 'ControlRight', mac: 'MetaRight' }

const KEY_NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
  ContextMenu: 'Menu',
}

const keyName = (key: string) => KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key)

const NAMES: Record<Keyboard, readonly [string, string, string, string]> = {
  // The Mac's symbols, in the order its menus write them
  mac: ['⌃', '⌥', '⇧', '⌘'],
  pc: ['Ctrl', 'Alt', 'Shift', 'Super'],
}

// The Mac writes its symbols together (⇧⌘D); the others join the names with + (Ctrl+Shift+D)
function modifiersLabel(modifiers: Modifiers, keyboard: Keyboard, key?: string): string {
  const [ctrl, alt, shift, meta] = NAMES[keyboard]
  const held = [
    modifiers.ctrl && ctrl,
    modifiers.alt && alt,
    modifiers.shift && shift,
    modifiers.meta && meta,
    key !== undefined && keyName(key),
  ]
  return held
    .filter((name): name is string => typeof name === 'string')
    .join(keyboard === 'mac' ? '' : '+')
}

// A tab by its place, from 0, or the last one
export type TabTarget = number | 'last'

// Electron's names for the modifiers of a global key, hand-written ones included, by the slot they take
const ACCELERATOR_MODIFIERS: Readonly<Record<string, keyof Modifiers>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  super: 'meta',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  cmdorctrl: 'meta',
  commandorcontrol: 'meta',
}
const ACCELERATOR_KEYS: Readonly<Record<string, string>> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
}

// A global key ("Super+Alt+K") in the Mac's symbols (⌥⌘K); a PC shows it as Electron writes it, and a
// name this does not know leaves the whole key as written
function acceleratorLabel(value: string, keyboard: Keyboard): string {
  const parts = value.split('+')
  const key = parts.pop()
  if (keyboard === 'pc' || !key) return value
  const held: Partial<Record<keyof Modifiers, boolean>> = {}
  for (const part of parts) {
    const slot = ACCELERATOR_MODIFIERS[part.toLowerCase()]
    if (!slot) return value
    held[slot] = true
  }
  return modifiersLabel(held, keyboard, ACCELERATOR_KEYS[key] ?? key)
}

// The actions whose key the user changed, as settings.json writes them
export type CustomKeys = Readonly<Partial<Record<ShortcutId, string>>>

export interface Keymap {
  readonly keyboard: Keyboard
  // The hold menu key until the user picks one
  readonly holdTrigger: HoldTrigger
  // What a click holds to open a link or a path: Cmd on the Mac, Ctrl elsewhere
  readonly click: {
    readonly modifier: 'meta' | 'ctrl'
    readonly label: string
    isHeld(event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>): boolean
  }
  matches(event: KeyInput, id: ShortcutId): boolean
  // The action of a key: a custom chord before any default one, so a key the user gave wins
  action(event: KeyInput): ShortcutId | undefined
  label(id: ShortcutId): string
  // The chords in use, the custom one alone when the user gave one; the first is the one the label shows
  chords(id: ShortcutId): readonly Chord[]
  defaults(id: ShortcutId): readonly Chord[]
  isCustom(id: ShortcutId): boolean
  chordLabel(chord: Chord): string
  // The chord as settings.json keeps it on this keyboard
  chordText(chord: Chord): string
  // 0 for the first tab when the event is Alt+1, or Cmd+1 on the Mac; the last tab for the 9
  tabIndex(event: KeyInput): TabTarget | undefined
  // A key inside a panel: Ctrl and a letter, Cmd on the Mac
  command(event: KeyInput, letter: string): boolean
  commandLabel(letter: string): string
  clipboard(event: KeyInput): 'copy' | 'paste' | undefined
  // The global key as this keyboard writes it
  accelerator(value: string): string
}

// `custom` is read at each key, so a key saved in Settings or by hand works at once
export function createKeymap(keyboard: Keyboard, custom: () => CustomKeys = () => ({})): Keymap {
  const defaults = KEYMAPS[keyboard]
  const primary = PRIMARY[keyboard]
  const label = (chord: Chord) => modifiersLabel(chord, keyboard, chord.key)
  const clipboard = CLIPBOARD[keyboard]
  // Each text is read once: the keys are matched on every keydown
  const parsed = new Map<string, Chord | undefined>()
  const customChord = (id: ShortcutId): Chord | undefined => {
    const text = custom()[id]
    if (text === undefined) return undefined
    if (!parsed.has(text)) parsed.set(text, parseChord(text))
    return parsed.get(text)
  }
  const chords = (id: ShortcutId): Chords => {
    const chosen = customChord(id)
    return chosen ? [chosen] : defaults[id]
  }
  const matches = (event: KeyInput, id: ShortcutId) =>
    chords(id).some((chord) => matchesChord(event, chord))
  return {
    keyboard,
    holdTrigger: HOLD_TRIGGER[keyboard],
    click: {
      modifier: primary.meta ? 'meta' : 'ctrl',
      label: modifiersLabel(primary, keyboard),
      isHeld: (event) => (primary.meta ? event.metaKey : event.ctrlKey),
    },
    matches,
    action: (event) =>
      SHORTCUT_IDS.find((id) => customChord(id) !== undefined && matches(event, id)) ??
      SHORTCUT_IDS.find((id) => customChord(id) === undefined && matches(event, id)),
    label: (id) => label(chords(id)[0]),
    chords,
    defaults: (id) => defaults[id],
    isCustom: (id) => customChord(id) !== undefined,
    chordLabel: label,
    chordText: (chord) => formatChord(chord, keyboard),
    tabIndex(event) {
      const digit = /^[1-9]$/.exec(eventKey(event))?.[0]
      if (digit === undefined) return undefined
      if (!matchesChord(event, { ...TAB[keyboard], key: digit })) return undefined
      return digit === '9' ? 'last' : Number(digit) - 1
    },
    command: (event, letter) => matchesChord(event, { ...primary, key: letter }),
    commandLabel: (letter) => label({ ...primary, key: letter }),
    accelerator: (value) => acceleratorLabel(value, keyboard),
    clipboard(event) {
      if (clipboard.copy && matchesChord(event, clipboard.copy)) return 'copy'
      if (clipboard.paste && matchesChord(event, clipboard.paste)) return 'paste'
      return undefined
    },
  }
}
