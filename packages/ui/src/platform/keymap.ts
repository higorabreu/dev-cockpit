import { type HoldTrigger, type KeyInput, physicalKey } from '@dck/core'

// Which modifier leads and what the keys are called differ between a Mac keyboard and the others
export type Keyboard = 'mac' | 'pc'

export const keyboardFor = (platform: string): Keyboard => (/^mac/i.test(platform) ? 'mac' : 'pc')

// One key and the modifiers held with it, exactly: a chord without shift does not match with shift held
interface Chord {
  // KeyboardEvent.key, in lowercase for a letter
  readonly key: string
  readonly ctrl?: boolean
  readonly alt?: boolean
  readonly shift?: boolean
  readonly meta?: boolean
}

type Modifiers = Omit<Chord, 'key'>

export type ShortcutId =
  | 'newTab'
  | 'closeTab'
  | 'renameTab'
  | 'nextTab'
  | 'previousTab'
  | 'settings'
  | 'review'
  | 'reviewLayout'
  | 'reviewSend'
  | 'theme'
  | 'projects'
  | 'views'
  | 'panel'
  | 'fullHeight'
  | 'opacityUp'
  | 'opacityDown'
  | 'fontBigger'
  | 'fontSmaller'
  | 'fontReset'
  | 'clearTerminal'

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

const pressedKey = (event: KeyInput) =>
  physicalKey(event)?.toLowerCase() ??
  (event.key.length === 1 ? event.key.toLowerCase() : event.key)

const matchesChord = (event: KeyInput, chord: Chord) =>
  event.ctrlKey === Boolean(chord.ctrl) &&
  event.altKey === Boolean(chord.alt) &&
  event.shiftKey === Boolean(chord.shift) &&
  event.metaKey === Boolean(chord.meta) &&
  pressedKey(event) === chord.key

const KEY_NAMES: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓' }

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
  label(id: ShortcutId): string
  // The modifiers alone, for a label that lists several keys after them
  modifiers(id: ShortcutId): string
  // 0 for the first tab when the event is Alt+1, or Cmd+1 on the Mac; the last tab for the 9
  tabIndex(event: KeyInput): TabTarget | undefined
  // A key inside a panel: Ctrl and a letter, Cmd on the Mac
  command(event: KeyInput, letter: string): boolean
  commandLabel(letter: string): string
  clipboard(event: KeyInput): 'copy' | 'paste' | undefined
}

export function createKeymap(keyboard: Keyboard): Keymap {
  const chords = KEYMAPS[keyboard]
  const primary = PRIMARY[keyboard]
  const label = (chord: Chord) => modifiersLabel(chord, keyboard, chord.key)
  const clipboard = CLIPBOARD[keyboard]
  return {
    keyboard,
    holdTrigger: HOLD_TRIGGER[keyboard],
    click: {
      modifier: primary.meta ? 'meta' : 'ctrl',
      label: modifiersLabel(primary, keyboard),
      isHeld: (event) => (primary.meta ? event.metaKey : event.ctrlKey),
    },
    matches: (event, id) => chords[id].some((chord) => matchesChord(event, chord)),
    label: (id) => label(chords[id][0]),
    modifiers: (id) => modifiersLabel(chords[id][0], keyboard),
    tabIndex(event) {
      const digit = /^[1-9]$/.exec(pressedKey(event))?.[0]
      if (digit === undefined) return undefined
      if (!matchesChord(event, { ...TAB[keyboard], key: digit })) return undefined
      return digit === '9' ? 'last' : Number(digit) - 1
    },
    command: (event, letter) => matchesChord(event, { ...primary, key: letter }),
    commandLabel: (letter) => label({ ...primary, key: letter }),
    clipboard(event) {
      if (clipboard.copy && matchesChord(event, clipboard.copy)) return 'copy'
      if (clipboard.paste && matchesChord(event, clipboard.paste)) return 'paste'
      return undefined
    },
  }
}
