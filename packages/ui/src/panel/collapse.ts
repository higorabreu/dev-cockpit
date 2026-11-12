const DURATION_MS = 170
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

// Closes with an animation before applying the state change, which redraws the panel
export function collapseThen(wrap: Element | null, apply: () => void) {
  if (!wrap || reducedMotion.matches) {
    apply()
    return
  }
  wrap.setAttribute('data-state', 'closing')
  setTimeout(apply, DURATION_MS)
}
