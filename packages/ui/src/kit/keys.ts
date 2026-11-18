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

// One cap per key, as VS Code shows them. The text reads as the label did ("Ctrl+Shift+D", "n p"), so
// a screen reader and a copy keep it; the gaps come from the style
export function keysMarkup(label: string, size: KeysSize = 'regular'): string {
  const chords = keyChords(label).map(({ keys, joiner }) => {
    const plus = joiner ? '<span class="kplus">+</span>' : ''
    return `<span class="kchord">${keys.map((key) => `<kbd class="key">${escapeHtml(key)}</kbd>`).join(plus)}</span>`
  })
  return `<kbd class="keys${size === 'compact' ? ' compact' : ''}">${chords.join(' ')}</kbd>`
}

// A key held while the mouse acts, as a sentence: caps for the key and plain words for the rest ("Ctrl" and
// "click to open"), joined as the keyboard writes a chord, so the text still reads "Ctrl+click to open"
// (or "⌘ click to open") for a screen reader
function gestureMarkup(key: string, words: string): string {
  const joiner = keyChords(key).at(-1)?.joiner === '+' ? '<span class="gesture-plus">+</span>' : ' '
  return `<span class="gesture">${keysMarkup(key, 'compact')}${joiner}${escapeHtml(words)}</span>`
}

export function gesture(key: string, words: string): HTMLElement {
  const holder = document.createElement('span')
  holder.innerHTML = gestureMarkup(key, words)
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
