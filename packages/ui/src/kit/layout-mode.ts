const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const DURATION_MS = 190

// FLIP: swaps the order in the layout and animates each block from the old position to the new one
export function setFullHeight(full: boolean, blocks: readonly HTMLElement[]) {
  document.body.classList.add('shifting')
  setTimeout(() => document.body.classList.remove('shifting'), DURATION_MS + 120)
  const before = blocks.map((block) => block.getBoundingClientRect().top)
  document.body.classList.toggle('full', full)
  if (reducedMotion.matches) return
  blocks.forEach((block, index) => {
    const delta = (before[index] ?? 0) - block.getBoundingClientRect().top
    if (!delta) return
    block.style.transition = 'none'
    block.style.transform = `translateY(${delta}px)`
    block.getBoundingClientRect()
    block.style.transition = `transform ${DURATION_MS}ms var(--motion-easing)`
    block.style.transform = ''
    setTimeout(() => {
      block.style.transition = ''
    }, DURATION_MS + 40)
  })
}
