const DURATION_MS = 170
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

// Fecha com animação antes de aplicar a mudança de estado, que redesenha o painel
export function collapseThen(wrap: Element | null, apply: () => void) {
  if (!wrap || reducedMotion.matches) {
    apply()
    return
  }
  wrap.setAttribute('data-state', 'closing')
  setTimeout(apply, DURATION_MS)
}
