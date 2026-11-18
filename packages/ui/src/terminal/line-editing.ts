import type { KeyInput } from '@dck/core'
import type { Terminal } from '@xterm/xterm'

// The Mac's text keys as the shell's line editor knows them, sent as VS Code and iTerm2's Natural Text
// Editing do: Cmd goes to the ends of the line and deletes to its start, Option moves and deletes by word
const COMMAND: Readonly<Record<string, string>> = {
  ArrowLeft: '\x01',
  ArrowRight: '\x05',
  Backspace: '\x15',
}
// Option+Backspace is left out: xterm already sends ESC DEL, which deletes the word before the cursor
const OPTION: Readonly<Record<string, string>> = {
  ArrowLeft: '\x1bb',
  ArrowRight: '\x1bf',
  Delete: '\x1bd',
}

// What a Mac key sends to the shell in place of xterm's own sequence, or undefined to leave it to xterm
export function lineEditSequence(event: KeyInput): string | undefined {
  if (event.ctrlKey || event.shiftKey || event.altKey === event.metaKey) return undefined
  return (event.metaKey ? COMMAND : OPTION)[event.key]
}

type EditedTerminal = Pick<Terminal, 'input'> & {
  readonly buffer: { readonly active: { readonly type: 'normal' | 'alternate' } }
}

// Only at the shell's prompt: a full-screen program (vim, less) runs in the alternate buffer and gets the
// raw key. The sequence goes through xterm's input, the same path as a typed key; false keeps it from xterm
export function attachLineEditing(terminal: EditedTerminal, onSent: () => void) {
  return function onKey(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown' || terminal.buffer.active.type !== 'normal') return true
    const sequence = lineEditSequence(event)
    if (sequence === undefined) return true
    event.preventDefault()
    terminal.input(sequence)
    onSent()
    return false
  }
}
