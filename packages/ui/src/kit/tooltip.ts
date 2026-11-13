import { placeTooltip } from '@dck/core'

const SHOW_DELAY_MS = 400
// Moving to a neighboring element right away, the tooltip shows without waiting
const CHAIN_WINDOW_MS = 300
const MAX_DEPTH = 5
const CHECK_MS = 500

export interface TipBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

// A part of an element that has no node of its own, like a link drawn in the terminal
export interface TipRegion {
  readonly text: string
  readonly key: string
  readonly box: TipBox
}

interface Candidate {
  readonly anchor: HTMLElement
  readonly text: string
  readonly key?: string
  readonly box?: TipBox
}

const regions = new WeakMap<HTMLElement, TipRegion>()
let reconsider: (target: HTMLElement) => void = () => undefined

// The owner says where the region is; the tooltip treats it like an element under the mouse
export function setTipRegion(owner: HTMLElement, region: TipRegion | undefined) {
  if (region) regions.set(owner, region)
  else regions.delete(owner)
  reconsider(owner)
}

function isTruncated(element: HTMLElement): boolean {
  const style = getComputedStyle(element)
  return style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth + 1
}

const tipOf = (anchor: HTMLElement, text: string): Candidate => {
  const key = anchor.getAttribute('data-tip-key')
  return key ? { anchor, text, key } : { anchor, text }
}

// `data-tip` always shows the given text; text cut by an ellipsis shows its full content
// (or `data-tip-full`, when the visible text is only part of what should be shown)
function candidateAt(target: EventTarget | null): Candidate | undefined {
  let element = target instanceof HTMLElement ? target : null
  for (let depth = 0; element && depth < MAX_DEPTH; depth++, element = element.parentElement) {
    const region = regions.get(element)
    if (region) return { anchor: element, ...region }
    const tip = element.getAttribute('data-tip')
    if (tip) return tipOf(element, tip)
    if (isTruncated(element)) {
      const text = element.getAttribute('data-tip-full') ?? element.textContent?.trim()
      if (text) return { anchor: element, text }
    }
  }
  return undefined
}

export function installTooltips() {
  const tip = document.createElement('div')
  tip.id = 'tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  document.body.append(tip)

  let current: HTMLElement | undefined
  // What is shown or waiting to show: moving inside the same region neither restarts the delay nor flickers
  let wanted: Candidate | undefined
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let checkTimer: ReturnType<typeof setInterval> | undefined
  let hiddenAt = 0

  function hide() {
    clearTimeout(showTimer)
    clearInterval(checkTimer)
    if (current) {
      current.removeAttribute('aria-describedby')
      hiddenAt = Date.now()
    }
    current = undefined
    wanted = undefined
    tip.dataset.open = 'false'
    tip.hidden = true
  }

  function show({ anchor, text, key, box: region }: Candidate) {
    // The element may have been replaced during the delay: there is nothing to anchor the tooltip to
    if (!anchor.isConnected) return
    const shortcut = document.createElement('kbd')
    shortcut.textContent = key ?? ''
    tip.replaceChildren(text, ...(key ? [shortcut] : []))
    // A stale position squeezes the tooltip against the edge and wraps the text, and the measurement comes out wrong
    tip.style.left = '0'
    tip.style.top = '0'
    tip.hidden = false
    const box = region ?? anchor.getBoundingClientRect()
    const size = tip.getBoundingClientRect()
    const placement = placeTooltip(
      { x: box.x, y: box.y, width: box.width, height: box.height },
      { width: size.width, height: size.height },
      { width: window.innerWidth, height: window.innerHeight },
      anchor.closest<HTMLElement>('[data-tip-side]')?.dataset.tipSide === 'left' ? 'left' : 'below',
    )
    tip.style.left = `${Math.round(placement.x)}px`
    tip.style.top = `${Math.round(placement.y)}px`
    tip.dataset.open = 'true'
    anchor.setAttribute('aria-describedby', 'tooltip')
    current = anchor
    // The panel redraws what changed; if the element left the screen, the tooltip goes with it
    checkTimer = setInterval(() => {
      if (!anchor.isConnected) hide()
    }, CHECK_MS)
  }

  function schedule(candidate: Candidate, instant: boolean) {
    if (wanted?.anchor === candidate.anchor && wanted.text === candidate.text) return
    hide()
    wanted = candidate
    const chained = Date.now() - hiddenAt < CHAIN_WINDOW_MS
    if (instant || chained) show(candidate)
    else showTimer = setTimeout(() => show(candidate), SHOW_DELAY_MS)
  }

  const consider = (target: EventTarget | null) => {
    const candidate = candidateAt(target)
    if (candidate) schedule(candidate, false)
    else hide()
  }
  reconsider = consider
  document.addEventListener('mouseover', (event) => consider(event.target))
  document.addEventListener('focusin', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    const text = target?.getAttribute('data-tip')
    if (target && text) schedule(tipOf(target, text), true)
  })
  document.addEventListener('focusout', hide)
  document.addEventListener('mousedown', hide, true)
  document.addEventListener('scroll', hide, true)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide()
  })
  window.addEventListener('blur', hide)
}
