import { placeTooltip } from '@dck/core'
import { type Gesture, gesture, keys } from './keys.ts'

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

// The key beside the text, a shortcut; with `gesture`, the key is held for a left click, and the
// action shows as a word after the caps, never as a cap
interface TipHint {
  readonly key?: string
  readonly gesture?: Gesture
  // A second held click on its own line, such as Ctrl+Shift+click opening a path the other way
  readonly alternate?: { readonly key: string; readonly gesture: Gesture }
}

// A part of an element that has no node of its own, like a link drawn in the terminal
export interface TipRegion extends TipHint {
  readonly text: string
  readonly box: TipBox
  // A file path, which wraps only after a separator
  readonly path?: boolean
}

interface Candidate extends TipHint {
  readonly anchor: HTMLElement
  readonly text: string
  readonly box?: TipBox
  readonly path?: boolean
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

// The key of an interface action for `data-tip-shortcut`, asked when the tooltip shows, so it follows a
// key the user changed; set once by installTooltips
let shortcutLabel: (id: string) => string | undefined = () => undefined

const tipOf = (anchor: HTMLElement, text: string): Candidate => {
  // `data-tip-path`: the text is a file path, which wraps only after a separator
  const tip = anchor.hasAttribute('data-tip-path') ? { anchor, text, path: true } : { anchor, text }
  const shortcut = anchor.getAttribute('data-tip-shortcut')
  const key =
    anchor.getAttribute('data-tip-key') ?? (shortcut ? shortcutLabel(shortcut) : undefined)
  if (!key) return tip
  // A left click with the key held: `data-tip-gesture` is what it does, `data-tip-click` its spoken name;
  // `data-tip-alt-key` and `data-tip-alt-gesture` a second one with other keys, as Ctrl+Shift+click
  const action = anchor.getAttribute('data-tip-gesture')
  const click = anchor.getAttribute('data-tip-click')
  if (!action || !click) return { ...tip, key }
  const held = { ...tip, key, gesture: { click, action } }
  const otherKey = anchor.getAttribute('data-tip-alt-key')
  const other = anchor.getAttribute('data-tip-alt-gesture')
  return otherKey && other
    ? { ...held, alternate: { key: otherKey, gesture: { click, action: other } } }
    : held
}

// A space before the keys keeps them apart from the text, and collapses when they wrap to a line of
// their own, so they line up with the text's left edge instead of sitting indented
function gap(): HTMLElement {
  const space = document.createElement('span')
  space.className = 'tip-gap'
  space.textContent = ' '
  return space
}

function hintOf({ key, gesture: held, alternate }: TipHint): HTMLElement[] {
  if (!key) return []
  if (!held) return [gap(), keys(key, 'compact')]
  return [gesture(key, held), ...(alternate ? [gesture(alternate.key, alternate.gesture)] : [])]
}

// A break is allowed after each separator, so a long path never wraps inside a name
export function pathText(path: string): Node[] {
  return path
    .split(/(?<=[\\/])/)
    .flatMap((part, index) =>
      index === 0
        ? [document.createTextNode(part)]
        : [document.createElement('wbr'), document.createTextNode(part)],
    )
}

// `data-tip` always shows the given text; text cut by an ellipsis shows its full content
// (or `data-tip-full`, when the visible text is only part of what should be shown)
function candidateAt(target: EventTarget | null): Candidate | undefined {
  // An icon's SVG is not an HTML element: the mouse on its strokes asks the element that holds it
  const start = target instanceof SVGElement ? target.closest('svg')?.parentElement : target
  let element = start instanceof HTMLElement ? start : null
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

function tipLine(text: string): HTMLElement {
  const line = document.createElement('span')
  line.className = 'tip-line'
  line.textContent = text
  return line
}

export interface TooltipOptions {
  shortcutLabel?(id: string): string | undefined
}

export function installTooltips(options: TooltipOptions = {}) {
  shortcutLabel = options.shortcutLabel ?? (() => undefined)
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

  function show(candidate: Candidate) {
    const { anchor, text, box: region } = candidate
    // The element may have been replaced during the delay: there is nothing to anchor the tooltip to
    if (!anchor.isConnected) return
    // A text of several lines, such as a list of commits, keeps each one on its own line, cut by the width
    const lines = text.split('\n')
    const single = candidate.path ? pathText(text) : [text]
    const body = lines.length > 1 ? lines.map((line) => tipLine(line)) : single
    tip.toggleAttribute('data-lines', lines.length > 1)
    tip.replaceChildren(...body, ...hintOf(candidate))
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
