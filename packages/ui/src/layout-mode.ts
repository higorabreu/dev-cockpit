const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const DURATION_MS = 190

// FLIP: troca a ordem no layout e anima cada bloco da posição antiga para a nova
export function setFullHeight(full: boolean, blocks: readonly HTMLElement[]) {
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
