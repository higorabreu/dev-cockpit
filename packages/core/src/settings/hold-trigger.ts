import type { Chord } from './shortcut-keys.ts'

// What opens the hold menu while held (D69): a key that types nothing, by its KeyboardEvent.code
// (`ControlRight`, `F13`, `CapsLock`), or a mouse button by its MouseEvent.button (`Mouse1` the middle one,
// `Mouse3` back, `Mouse4` forward)
export type HoldTrigger = string

// The left and right buttons click and open menus, so they never hold the menu
export const MOUSE_TRIGGERS = ['Mouse1', 'Mouse3', 'Mouse4'] as const

// Keys that write, move the cursor or answer a prompt: the terminal needs them
const TERMINAL_CODES =
  /^(Key[A-Z]|Digit\d|Numpad\w*|Space|Enter|Tab|Escape|Backspace|Delete|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|Intl\w+)$/

export type HoldTriggerProblem =
  // A key the terminal needs
  | 'terminalKey'
  // The left or the right mouse button
  | 'mainButton'
  // A code no key reports
  | 'unknown'

export function holdTriggerProblem(code: string): HoldTriggerProblem | undefined {
  const button = /^Mouse(\d)$/.exec(code)
  if (button) return (MOUSE_TRIGGERS as readonly string[]).includes(code) ? undefined : 'mainButton'
  if (!/^[A-Z][A-Za-z0-9]{1,31}$/.test(code) || code === 'Unidentified') return 'unknown'
  return TERMINAL_CODES.test(code) ? 'terminalKey' : undefined
}

export const isHoldTrigger = (code: string) => holdTriggerProblem(code) === undefined

export const mouseTrigger = (button: number): HoldTrigger => `Mouse${button}`

// The mouse button a trigger names, or undefined for a key
export function triggerButton(trigger: HoldTrigger): number | undefined {
  const found = /^Mouse(\d)$/.exec(trigger)
  return found ? Number(found[1]) : undefined
}

// True when the middle button (`Mouse1`) holds the menu, so a middle click on a tab keeps that meaning
export const holdsMiddleButton = (trigger: HoldTrigger) => triggerButton(trigger) === 1

// Keys whose code and key have the same name, so a trigger and a chord with no modifier can be the same key
const SHARED_NAMES = /^(F([1-9]|1\d|2[0-4])|Insert|Pause|ScrollLock|ContextMenu)$/

// The chord a trigger key makes when pressed alone, to tell it apart from the interface's keys
export function triggerChord(trigger: HoldTrigger): Chord | undefined {
  return SHARED_NAMES.test(trigger) ? { key: trigger } : undefined
}

// The trigger a chord with no modifier can become, or undefined when it holds any
export function chordTrigger(chord: Chord): HoldTrigger | undefined {
  const bare = !chord.ctrl && !chord.alt && !chord.shift && !chord.meta
  return bare && SHARED_NAMES.test(chord.key) ? chord.key : undefined
}
