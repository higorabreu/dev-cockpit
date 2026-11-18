export interface KeyInput {
  readonly key: string
  readonly code: string
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS'])

export const isModifierKey = (key: string) => MODIFIER_KEYS.has(key)

const NAMED: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
}

const isFunctionKey = (key: string) => /^F([1-9]|1\d|2[0-4])$/.test(key)

// Option changes the character on the Mac (Option+1 types ¡), so with Alt the physical key names it:
// A for KeyA, 1 for Digit1, Space for Space
export function physicalKey(event: KeyInput): string | undefined {
  const physical = event.altKey ? /^(?:Key([A-Z])|Digit(\d)|(Space))$/.exec(event.code) : null
  return physical ? (physical[1] ?? physical[2] ?? 'Space') : undefined
}

const keyName = (event: KeyInput) =>
  physicalKey(event) ??
  NAMED[event.key] ??
  (event.key.length === 1 ? event.key.toUpperCase() : event.key)

export type AcceleratorResult =
  | { readonly type: 'accelerator'; readonly value: string }
  // Still only modifiers: keep waiting
  | { readonly type: 'pending' }
  | { readonly type: 'cancel' }
  // Key that cannot serve as a global shortcut, with the reason
  | { readonly type: 'invalid'; readonly reason: 'needsModifier' | 'unsupported' }

// Converts what the user typed into Electron's global shortcut format, like "Ctrl+Alt+Space".
// Letters, digits and symbols require a modifier, so normal typing is not taken over
export function acceleratorFromEvent(event: KeyInput): AcceleratorResult {
  if (isModifierKey(event.key)) return { type: 'pending' }
  if (event.key === 'Escape') return { type: 'cancel' }
  const name = keyName(event)
  const supported = isFunctionKey(name) || name in invert(NAMED) || /^[A-Z0-9]$/.test(name)
  if (!supported) return { type: 'invalid', reason: 'unsupported' }

  const modifiers = [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Super',
  ].filter((part): part is string => typeof part === 'string')
  if (modifiers.length === 0 && !isFunctionKey(name)) {
    return { type: 'invalid', reason: 'needsModifier' }
  }
  return { type: 'accelerator', value: [...modifiers, name].join('+') }
}

function invert(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key]))
}
