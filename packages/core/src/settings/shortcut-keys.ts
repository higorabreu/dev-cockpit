import { isModifierKey, type KeyInput, physicalKey } from './accelerator.ts'

// Which modifier leads and what the keys are called differ between a Mac keyboard and the others
export type Keyboard = 'mac' | 'pc'

// The interface's actions that have a key; the user can give each one another (D69)
export const SHORTCUT_IDS = [
  'newTab',
  'closeTab',
  'renameTab',
  'nextTab',
  'previousTab',
  'clearTerminal',
  'review',
  'reviewLayout',
  'reviewSend',
  'projects',
  'fileSearch',
  'views',
  'panel',
  'settings',
  'theme',
  'fullHeight',
  'opacityUp',
  'opacityDown',
  'fontBigger',
  'fontSmaller',
  'fontReset',
] as const

export type ShortcutId = (typeof SHORTCUT_IDS)[number]

export const isShortcutId = (value: string): value is ShortcutId =>
  (SHORTCUT_IDS as readonly string[]).includes(value)

// One key and the modifiers held with it, exactly: a chord without shift does not match with shift held
export interface Chord {
  // KeyboardEvent.key, in lowercase for a letter
  readonly key: string
  readonly ctrl?: boolean
  readonly alt?: boolean
  readonly shift?: boolean
  readonly meta?: boolean
}

export type ChordModifiers = Omit<Chord, 'key'>

// Keys that write or edit text: alone or with Shift they belong to whatever has the focus
const EDITING_KEYS = new Set([
  ' ',
  'Tab',
  'Enter',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])
// Keys that type nothing, which a shortcut may take alone, as F11 does
const SILENT_KEYS = new Set(['Insert', 'Pause', 'ScrollLock', 'ContextMenu'])

const isFunctionKey = (key: string) => /^F([1-9]|1\d|2[0-4])$/.test(key)
const isCharacter = (key: string) => [...key].length === 1

export type ChordProblem = 'needsModifier' | 'unsupported'

// Why a chord cannot be an interface shortcut, or undefined when it can. Shift alone does not count: with
// a letter it only types the capital
export function chordProblem(chord: Chord): ChordProblem | undefined {
  const { key } = chord
  const typing = isCharacter(key) || EDITING_KEYS.has(key)
  if (!typing && !SILENT_KEYS.has(key) && !isFunctionKey(key)) return 'unsupported'
  if (typing && !chord.ctrl && !chord.alt && !chord.meta) return 'needsModifier'
  return undefined
}

// How the file writes a key that is not a plain character
const KEY_TEXT: Readonly<Record<string, string>> = {
  ' ': 'Space',
  '+': 'Plus',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
}

// Names read from the file, in any case; Electron's and the browser's spellings both work
const KEY_NAMES: Readonly<Record<string, string>> = {
  space: ' ',
  plus: '+',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pgup: 'PageUp',
  pagedown: 'PageDown',
  pgdn: 'PageDown',
  insert: 'Insert',
  ins: 'Insert',
  pause: 'Pause',
  scrolllock: 'ScrollLock',
  contextmenu: 'ContextMenu',
  menu: 'ContextMenu',
}

const MODIFIER_NAMES: Readonly<Record<string, keyof ChordModifiers>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  super: 'meta',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
}

const CHORD_TEXT_MAX = 64

function keyFromName(name: string): string | undefined {
  if (isCharacter(name)) return name.toLowerCase()
  const lower = name.toLowerCase()
  if (isFunctionKey(name.toUpperCase())) return name.toUpperCase()
  return KEY_NAMES[lower]
}

// Reads a chord as settings.json writes it ("Ctrl+Shift+T", "Cmd+K", "F11", "Ctrl+Plus"); undefined when
// it is not one an interface shortcut can take
export function parseChord(text: string): Chord | undefined {
  const trimmed = text.trim()
  if (trimmed === '' || trimmed.length > CHORD_TEXT_MAX) return undefined
  // A + at the end is the key itself (Ctrl++)
  const parts =
    trimmed === '+'
      ? ['+']
      : trimmed.endsWith('++')
        ? [...trimmed.slice(0, -2).split('+'), '+']
        : trimmed.split('+')
  const name = parts.pop()?.trim()
  const key = name ? keyFromName(name) : undefined
  if (key === undefined) return undefined
  const held: { -readonly [K in keyof ChordModifiers]: boolean } = {}
  for (const part of parts) {
    const slot = MODIFIER_NAMES[part.trim().toLowerCase()]
    if (!slot || held[slot]) return undefined
    held[slot] = true
  }
  const chord: Chord = { key, ...held }
  return chordProblem(chord) === undefined ? chord : undefined
}

// The chord as settings.json keeps it; the Mac's names for Alt and Super read as its keys do
export function formatChord(chord: Chord, keyboard: Keyboard): string {
  const mac = keyboard === 'mac'
  const parts = [
    chord.ctrl && 'Ctrl',
    chord.alt && (mac ? 'Option' : 'Alt'),
    chord.shift && 'Shift',
    chord.meta && (mac ? 'Cmd' : 'Super'),
    KEY_TEXT[chord.key] ?? (isCharacter(chord.key) ? chord.key.toUpperCase() : chord.key),
  ]
  return parts.filter((part): part is string => typeof part === 'string').join('+')
}

export const sameChord = (a: Chord, b: Chord) =>
  a.key === b.key &&
  Boolean(a.ctrl) === Boolean(b.ctrl) &&
  Boolean(a.alt) === Boolean(b.alt) &&
  Boolean(a.shift) === Boolean(b.shift) &&
  Boolean(a.meta) === Boolean(b.meta)

// The key of an event as a chord names it: a letter in lowercase, and with Alt the physical key, since
// Option changes the character on the Mac
export function eventKey(event: KeyInput): string {
  const physical = physicalKey(event)
  if (physical !== undefined) return physical === 'Space' ? ' ' : physical.toLowerCase()
  return isCharacter(event.key) ? event.key.toLowerCase() : event.key
}

export const matchesChord = (event: KeyInput, chord: Chord) =>
  event.ctrlKey === Boolean(chord.ctrl) &&
  event.altKey === Boolean(chord.alt) &&
  event.shiftKey === Boolean(chord.shift) &&
  event.metaKey === Boolean(chord.meta) &&
  eventKey(event) === chord.key

export type ChordResult =
  | { readonly type: 'chord'; readonly chord: Chord }
  // Still only modifiers: keep waiting
  | { readonly type: 'pending' }
  | { readonly type: 'cancel' }
  | { readonly type: 'invalid'; readonly reason: ChordProblem }

// What the user pressed while a shortcut row records; Esc cancels
export function chordFromEvent(event: KeyInput): ChordResult {
  if (isModifierKey(event.key)) return { type: 'pending' }
  if (event.key === 'Escape') return { type: 'cancel' }
  const chord: Chord = {
    key: eventKey(event),
    ...(event.ctrlKey ? { ctrl: true } : {}),
    ...(event.altKey ? { alt: true } : {}),
    ...(event.shiftKey ? { shift: true } : {}),
    ...(event.metaKey ? { meta: true } : {}),
  }
  const reason = chordProblem(chord)
  return reason ? { type: 'invalid', reason } : { type: 'chord', chord }
}

// A chord the terminal's shell reads, which an interface shortcut takes from it: Ctrl and a character on
// a PC (Ctrl+Shift is the cockpit's), any Control chord on a Mac, where Cmd is the cockpit's
export function isShellChord(chord: Chord, keyboard: Keyboard): boolean {
  if (!chord.ctrl || chord.meta) return false
  if (keyboard === 'mac') return true
  return !chord.alt && !chord.shift && isCharacter(chord.key)
}
