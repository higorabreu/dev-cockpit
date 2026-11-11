export interface KeyInput {
  readonly key: string
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS'])

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

export type AcceleratorResult =
  | { readonly type: 'accelerator'; readonly value: string }
  // Ainda só modificadores: continuar esperando
  | { readonly type: 'pending' }
  | { readonly type: 'cancel' }
  // Tecla que não serve como atalho global, com o motivo
  | { readonly type: 'invalid'; readonly reason: 'needsModifier' | 'unsupported' }

// Converte o que o usuário digitou no formato de atalho global do Electron, como "Ctrl+Alt+Space".
// Letras, números e símbolos exigem um modificador, para não tomar a digitação normal
export function acceleratorFromEvent(event: KeyInput): AcceleratorResult {
  if (MODIFIER_KEYS.has(event.key)) return { type: 'pending' }
  if (event.key === 'Escape') return { type: 'cancel' }
  const name = NAMED[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key)
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
