import type { MacOptionAsMeta } from '@dck/core'
import type { Terminal } from '@xterm/xterm'

// Whether xterm reads Option as Meta for this key: with `left` the right Option types characters
export function optionIsMeta(mode: MacOptionAsMeta, rightHeld: boolean): boolean {
  return mode === 'left' ? !rightHeld : mode === 'both'
}

type OptionEvent = Pick<KeyboardEvent, 'type' | 'code' | 'altKey'>

// Whether the right Option is down after this key event. A key with no Option held says it is up, so a
// release the terminal never saw is put right by the next key
export function rightOptionHeld(held: boolean, event: OptionEvent): boolean {
  if (event.code === 'AltRight') return event.type === 'keydown'
  return event.altKey ? held : false
}

// xterm has a single Option switch, read as each key arrives: it is set here first, by which Option is down
export function attachOptionKeys(terminal: Pick<Terminal, 'options'>, initial: MacOptionAsMeta) {
  let mode = initial
  let held = false
  const apply = () => {
    const meta = optionIsMeta(mode, held)
    if (terminal.options.macOptionIsMeta !== meta) terminal.options.macOptionIsMeta = meta
  }
  apply()
  return {
    // Never keeps the key from xterm: it only gets the switch right for it
    onKey(event: KeyboardEvent): boolean {
      held = rightOptionHeld(held, event)
      apply()
      return true
    },
    // The terminal lost the focus: the Option may be released where it cannot see it
    reset() {
      held = false
      apply()
    },
    setMode(next: MacOptionAsMeta) {
      mode = next
      apply()
    },
  }
}
