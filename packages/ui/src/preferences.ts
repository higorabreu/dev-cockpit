import { FONT_SIZE, OPACITY, readPreference } from '@dck/core'

const OPACITY_KEY = 'dck-opacity'
const FONT_KEY = 'dck-font-size'

function read(key: string, range: typeof OPACITY | typeof FONT_SIZE): number {
  try {
    return readPreference(localStorage.getItem(key), range)
  } catch {
    return range.initial
  }
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // sem armazenamento, vale só nesta execução
  }
}

export const loadOpacity = () => read(OPACITY_KEY, OPACITY)
export const loadFontSize = () => read(FONT_KEY, FONT_SIZE)
export const saveOpacity = (value: number) => write(OPACITY_KEY, value)
export const saveFontSize = (value: number) => write(FONT_KEY, value)

export function applyOpacity(value: number) {
  document.documentElement.style.setProperty('--surface-alpha', String(value))
}
