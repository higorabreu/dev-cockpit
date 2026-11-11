import { placeTooltip } from '@dck/core'

const SHOW_DELAY_MS = 400
// Passando de um elemento para o vizinho logo em seguida, o tooltip aparece sem esperar
const CHAIN_WINDOW_MS = 300
const MAX_DEPTH = 5
const CHECK_MS = 500

interface Candidate {
  readonly anchor: HTMLElement
  readonly text: string
  readonly instant: boolean
}

function isTruncated(element: HTMLElement): boolean {
  const style = getComputedStyle(element)
  return style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth + 1
}

// `data-tip` sempre mostra o texto dado; texto cortado por reticências mostra o conteúdo inteiro
// (ou `data-tip-full`, quando o texto visível é só parte do que se quer mostrar)
function candidateAt(target: EventTarget | null): Omit<Candidate, 'instant'> | undefined {
  let element = target instanceof HTMLElement ? target : null
  for (let depth = 0; element && depth < MAX_DEPTH; depth++, element = element.parentElement) {
    const tip = element.getAttribute('data-tip')
    if (tip) return { anchor: element, text: tip }
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
    tip.dataset.open = 'false'
    tip.hidden = true
  }

  function show({ anchor, text }: Omit<Candidate, 'instant'>) {
    // O elemento pode ter sido trocado durante o atraso: não há onde ancorar o tooltip
    if (!anchor.isConnected) return
    tip.textContent = text
    tip.hidden = false
    const box = anchor.getBoundingClientRect()
    const size = tip.getBoundingClientRect()
    const placement = placeTooltip(
      { x: box.x, y: box.y, width: box.width, height: box.height },
      { width: size.width, height: size.height },
      { width: window.innerWidth, height: window.innerHeight },
      anchor.dataset.tipSide === 'left' ? 'left' : 'below',
    )
    tip.style.left = `${Math.round(placement.x)}px`
    tip.style.top = `${Math.round(placement.y)}px`
    tip.dataset.open = 'true'
    anchor.setAttribute('aria-describedby', 'tooltip')
    current = anchor
    // O painel redesenha o que mudou; se o elemento saiu da tela o tooltip sai junto
    checkTimer = setInterval(() => {
      if (!anchor.isConnected) hide()
    }, CHECK_MS)
  }

  function schedule(candidate: Omit<Candidate, 'instant'>, instant: boolean) {
    if (current === candidate.anchor) return
    hide()
    const chained = Date.now() - hiddenAt < CHAIN_WINDOW_MS
    if (instant || chained) show(candidate)
    else showTimer = setTimeout(() => show(candidate), SHOW_DELAY_MS)
  }

  document.addEventListener('mouseover', (event) => {
    const candidate = candidateAt(event.target)
    if (candidate) schedule(candidate, false)
    else hide()
  })
  document.addEventListener('focusin', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    const text = target?.getAttribute('data-tip')
    if (target && text) schedule({ anchor: target, text }, true)
  })
  document.addEventListener('focusout', hide)
  document.addEventListener('mousedown', hide, true)
  document.addEventListener('scroll', hide, true)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide()
  })
  window.addEventListener('blur', hide)
}
