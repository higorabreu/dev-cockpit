// The Mac writes its modifiers as symbols, one per key and with nothing between them (⇧⌘D)
const MAC_MODIFIERS = new Set(['⌃', '⌥', '⇧', '⌘'])

export interface Chord {
  readonly keys: readonly string[]
  // What the label writes between the keys: + on a PC, nothing on a Mac
  readonly joiner: '+' | ''
}

function chord(group: string): Chord {
  const characters = [...group]
  const modifiers: string[] = []
  while (MAC_MODIFIERS.has(characters[0] ?? '')) modifiers.push(characters.shift() as string)
  if (modifiers.length > 0) {
    const key = characters.join('')
    return { keys: key ? [...modifiers, key] : modifiers, joiner: '' }
  }
  if (!group.includes('+') || group === '+') return { keys: [group], joiner: '+' }
  // A + at the end is the key itself (Ctrl++)
  const parts = group.endsWith('++') ? [...group.slice(0, -2).split('+'), '+'] : group.split('+')
  return { keys: parts.filter((part) => part !== ''), joiner: '+' }
}

// A shortcut as the keymap or a hint writes it ("Ctrl+Shift+D", "⇧⌘D", "n p", "Ctrl+= − 0"): spaces
// separate chords or alternatives, and + joins the keys of one chord
export function keyChords(label: string): Chord[] {
  return label.trim().split(/\s+/).filter(Boolean).map(chord)
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type KeysSize = 'regular' | 'compact'

// The left mouse button as a key of a chord ("Ctrl+MouseLeft", "⌘MouseLeft"), drawn as a mouse
export const MOUSE_LEFT = 'MouseLeft'

// A mouse outline on a 1px grid with its left button filled; the stroke follows the app's icons
const MOUSE_LEFT_ICON =
  '<svg class="key-icon" viewBox="0 0 9 12" width="9" height="12" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="0.5" y="0.5" width="8" height="11" rx="4"/>' +
  '<path d="M4.5 0.5A4 4 0 0 0 0.5 4.5H4.5Z" fill="currentColor"/>' +
  '<path d="M4.5 4.5H8.5"/></svg>'

// What a screen reader says for a key drawn as an icon ("left click"), in the user's language
export type KeyNames = Readonly<Record<string, string>>

// A Mac chord writes its keys with nothing between them: the name of an icon key gets a space before it
function capMarkup(key: string, names: KeyNames, spaced: boolean): string {
  if (key !== MOUSE_LEFT) return `<kbd class="key">${escapeHtml(key)}</kbd>`
  const name = `${spaced ? ' ' : ''}${names[key] ?? key}`
  return `<kbd class="key mouse">${MOUSE_LEFT_ICON}<span class="key-name">${escapeHtml(name)}</span></kbd>`
}

// One cap per key, as VS Code shows them. The text reads as the label did ("Ctrl+Shift+D", "n p"), so
// a screen reader and a copy keep it; the gaps come from the style
export function keysMarkup(
  label: string,
  size: KeysSize = 'regular',
  names: KeyNames = {},
): string {
  const chords = keyChords(label).map(({ keys, joiner }) => {
    const plus = joiner ? '<span class="kplus">+</span>' : ''
    const caps = keys.map((key, index) => capMarkup(key, names, !joiner && index > 0))
    return `<span class="kchord">${caps.join(plus)}</span>`
  })
  return `<kbd class="keys${size === 'compact' ? ' compact' : ''}">${chords.join(' ')}</kbd>`
}

// A left click while a key is held, and what it does: "[Ctrl] + [mouse]  Open", or "[⌘] [mouse]  Open"
// on a Mac. The click joins the key as the keyboard writes a chord; the action is a word apart, not a cap
export interface Gesture {
  // The click's name for a screen reader ("left click")
  readonly click: string
  readonly action: string
}

export function gesture(key: string, { click, action }: Gesture): HTMLElement {
  const joiner = keyChords(key).at(-1)?.joiner ?? '+'
  const caps = keysMarkup(`${key}${joiner}${MOUSE_LEFT}`, 'compact', { [MOUSE_LEFT]: click })
  // The comma is only heard: "Ctrl+left click, Open"
  const words = `<span class="gesture-action"><span class="key-name">, </span>${escapeHtml(action)}</span>`
  const holder = document.createElement('span')
  holder.innerHTML = `<span class="gesture">${caps}${words}</span>`
  return holder.firstElementChild as HTMLElement
}

// One cap with a name that may hold spaces ("Right Ctrl"), which `keys` would read as two keys
export function keyCap(name: string): HTMLElement {
  const holder = document.createElement('span')
  holder.innerHTML = `<kbd class="keys"><span class="kchord"><kbd class="key">${escapeHtml(name)}</kbd></span></kbd>`
  return holder.firstElementChild as HTMLElement
}

export function keys(label: string, size: KeysSize = 'regular'): HTMLElement {
  const holder = document.createElement('span')
  holder.innerHTML = keysMarkup(label, size)
  return holder.firstElementChild as HTMLElement
}
