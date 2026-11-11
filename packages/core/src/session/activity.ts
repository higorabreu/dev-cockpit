import type { SessionActivity } from '../ports/session.ts'

const SHELLS = new Set(['bash', 'zsh', 'fish', 'sh', 'dash', 'ksh', 'tcsh'])

// Classifica o que está em primeiro plano: o prompt do shell, o Claude ou outro comando
export function classifyActivity(foreground: string): SessionActivity {
  const name = foreground.trim().toLowerCase()
  if (SHELLS.has(name)) return 'idle'
  if (name === 'claude') return 'claude'
  return 'busy'
}
