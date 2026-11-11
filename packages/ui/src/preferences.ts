export function applyOpacity(value: number) {
  document.documentElement.style.setProperty('--surface-alpha', String(value))
}
