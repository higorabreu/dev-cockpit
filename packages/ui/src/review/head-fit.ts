// The header's ways of making room, in order, each taken only while its row still overflows: the viewed
// count down to its numbers, the send button down to its count, then the scope's label cut by an ellipsis.
// Before any of them the scope already narrowed to its current label, from as wide as its longest
const STEPS = ['shortTally', 'shortSend', 'cutScope'] as const

export function fitHead(head: HTMLElement, scope: HTMLElement): void {
  for (const step of STEPS) delete head.dataset[step]
  const button = scope.querySelector<HTMLElement>('.select')
  const value = button?.querySelector<HTMLElement>('.select-value')
  const current = value?.querySelector<HTMLElement>('[data-current]')
  if (button && value && current) {
    // The cell stretches every label to the longest one, so the text itself is measured
    const text = document.createRange()
    text.selectNodeContents(current)
    const frame = button.offsetWidth - value.offsetWidth
    scope.style.setProperty(
      '--scope-min',
      `${Math.ceil(frame + text.getBoundingClientRect().width)}px`,
    )
  }
  for (const step of STEPS) {
    if (head.scrollWidth <= head.clientWidth) return
    head.dataset[step] = ''
  }
}

// Fits again when the header's width or its content changes: a new count, a send button, another scope
export function watchHead(head: HTMLElement, scope: HTMLElement): void {
  const fit = () => fitHead(head, scope)
  new ResizeObserver(fit).observe(head)
  new MutationObserver(fit).observe(head, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'aria-disabled'],
  })
}
