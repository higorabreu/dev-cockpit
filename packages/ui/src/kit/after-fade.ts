const seconds = (list: string) => list.split(',').map((value) => Number.parseFloat(value) || 0)

// How long the element's transitions take from now, delays included, in milliseconds
export function transitionMs(
  style: Pick<CSSStyleDeclaration, 'transitionDuration' | 'transitionDelay'>,
) {
  const durations = seconds(style.transitionDuration)
  const delays = seconds(style.transitionDelay)
  return Math.max(
    0,
    ...durations.map((duration, index) => (duration + (delays[index] ?? 0)) * 1000),
  )
}

// Runs `run` once a closing overlay has faded out, so it fades with what it showed and is cleared after;
// at once when it does not fade (reduced motion). The caller checks it is still closed by then
export function afterFade(element: HTMLElement, run: () => void) {
  const wait = transitionMs(getComputedStyle(element))
  if (wait === 0) run()
  else setTimeout(run, wait)
}
