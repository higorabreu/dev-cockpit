import { h, icon } from '../panel/dom.ts'

export interface SelectOption {
  readonly value: string
  readonly label: string
  // Secondary text shown at the right of the option in the list (a count), never in the closed control
  readonly detail?: string
}

export interface SelectDeps {
  readonly id: string
  readonly options: readonly SelectOption[]
  readonly value: string
  // Id of the visible label that names the control
  readonly labelledBy: string
  readonly disabled?: boolean
  onChange(value: string): void
}

const CHEVRON = '<path d="M6 9l6 6 6-6"/>'
const CHECK = '<path d="M5 12.5l4.5 4.5L19 7"/>'
const GAP = 4
const EDGE = 4

// Select-only combobox (WAI-ARIA APG): the focus stays on the button and the list follows it
export function createSelect(deps: SelectDeps) {
  let options = deps.options
  let value = deps.value
  let active = -1

  const current = h('span', { class: 'select-value' })
  const button = h(
    'button',
    {
      type: 'button',
      id: deps.id,
      class: 'select',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-controls': `${deps.id}-list`,
      'aria-labelledby': deps.labelledBy,
      disabled: deps.disabled,
    },
    current,
    icon(CHEVRON, 16, 'select-chevron'),
  )
  const list = h('div', {
    class: 'select-list scroll',
    id: `${deps.id}-list`,
    role: 'listbox',
    'aria-labelledby': deps.labelledBy,
    hidden: true,
  })
  const element = h('span', { class: 'select-field' }, button, list)

  const isOpen = () => !list.hidden
  const selectedIndex = () => options.findIndex((option) => option.value === value)
  const optionId = (index: number) => `${deps.id}-option-${index}`

  function drawValue() {
    current.replaceChildren(
      ...options.map((option) =>
        h('span', { 'data-current': option.value === value ? 'true' : undefined }, option.label),
      ),
    )
  }

  function drawList() {
    list.replaceChildren(
      ...options.map((option, index) =>
        h(
          'div',
          {
            class: 'select-option',
            role: 'option',
            id: optionId(index),
            'aria-selected': String(option.value === value),
            'data-index': String(index),
          },
          h('span', { class: 'select-label' }, option.label),
          option.detail !== undefined && h('span', { class: 'select-detail' }, option.detail),
          h('span', { class: 'select-check' }, option.value === value && icon(CHECK, 14)),
        ),
      ),
    )
  }

  function reveal(option: HTMLElement) {
    const top = option.offsetTop
    const bottom = top + option.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight
  }

  function setActive(index: number, scroll = true) {
    active = Math.max(0, Math.min(index, options.length - 1))
    for (const option of list.children) {
      option.classList.toggle('on', option.id === optionId(active))
    }
    button.setAttribute('aria-activedescendant', optionId(active))
    const option = list.children[active]
    if (scroll && option instanceof HTMLElement) reveal(option)
  }

  // Below the button, or above it when the list does not fit below and does above
  function place() {
    const anchor = button.getBoundingClientRect()
    list.style.minWidth = `${Math.round(anchor.width)}px`
    const { width, height } = list.getBoundingClientRect()
    const fitsBelow = anchor.bottom + GAP + height <= window.innerHeight - EDGE
    const fitsAbove = anchor.top - GAP - height >= EDGE
    const top = fitsBelow || !fitsAbove ? anchor.bottom + GAP : anchor.top - GAP - height
    // Settings controls sit on the right of their row, so the list keeps the button's right edge
    const left = Math.max(EDGE, Math.min(anchor.right - width, window.innerWidth - width - EDGE))
    list.style.top = `${Math.round(top)}px`
    list.style.left = `${Math.round(left)}px`
  }

  // The list is fixed to the window, so it closes when the page under it scrolls or resizes
  function onScroll(event: Event) {
    if (event.target !== list) close()
  }

  // A click outside only closes the list, like a native select, instead of reaching the screen behind it
  function onOutside(event: MouseEvent) {
    const target = event.target
    if (target instanceof Node && (button.contains(target) || list.contains(target))) return
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  function open(index: number) {
    if (button.disabled || options.length === 0) return
    if (!isOpen()) {
      drawList()
      list.hidden = false
      button.setAttribute('aria-expanded', 'true')
      place()
      document.addEventListener('scroll', onScroll, true)
      document.addEventListener('mousedown', onOutside, true)
      window.addEventListener('resize', close)
    }
    setActive(index)
  }

  function close() {
    document.removeEventListener('scroll', onScroll, true)
    document.removeEventListener('mousedown', onOutside, true)
    window.removeEventListener('resize', close)
    if (!isOpen()) return
    list.hidden = true
    button.setAttribute('aria-expanded', 'false')
    button.removeAttribute('aria-activedescendant')
  }

  function pick(index: number) {
    const option = options[index]
    close()
    if (!option || option.value === value) return
    value = option.value
    drawValue()
    deps.onChange(value)
  }

  // The next option, after `from` and wrapping around, whose label starts with the typed letter
  function matchFrom(from: number, letter: string): number | undefined {
    const typed = letter.toLocaleLowerCase()
    for (let step = 1; step <= options.length; step++) {
      const index = (from + step) % options.length
      if (options[index]?.label.toLocaleLowerCase().startsWith(typed)) return index
    }
    return undefined
  }

  const isLetter = (event: KeyboardEvent) =>
    event.key.length === 1 && event.key !== ' ' && !event.altKey

  // True when the key was used
  function onClosedKey(event: KeyboardEvent): boolean {
    const { key } = event
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) open(selectedIndex())
    else if (key === 'Home') open(0)
    else if (key === 'End') open(options.length - 1)
    else if (isLetter(event)) {
      const index = matchFrom(selectedIndex(), key)
      if (index === undefined) return false
      open(index)
    } else return false
    return true
  }

  function onOpenKey(event: KeyboardEvent): boolean {
    const { key, altKey } = event
    if (key === 'ArrowUp' && altKey) pick(active)
    else if (key === 'ArrowDown') setActive(active + 1)
    else if (key === 'ArrowUp') setActive(active - 1)
    else if (key === 'Home') setActive(0)
    else if (key === 'End') setActive(options.length - 1)
    else if (key === 'Enter' || key === ' ') pick(active)
    else if (key === 'Escape') close()
    else if (key === 'Tab') {
      close()
      return false
    } else if (isLetter(event)) {
      const index = matchFrom(active, key)
      if (index !== undefined) setActive(index)
    } else return false
    return true
  }

  button.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey) return
    const used = isOpen() ? onOpenKey(event) : onClosedKey(event)
    if (!used) return
    // Escape stops here so the screen around the control stays open
    event.preventDefault()
    event.stopPropagation()
  })
  // A button clicks itself when Space is released; the keydown already handled it
  button.addEventListener('keyup', (event) => {
    if (event.key === ' ') event.preventDefault()
  })
  button.addEventListener('click', () => (isOpen() ? close() : open(selectedIndex())))
  button.addEventListener('focusout', close)

  const indexAt = (target: EventTarget | null): number | undefined => {
    const option = target instanceof Element ? target.closest<HTMLElement>('[data-index]') : null
    return option ? Number(option.dataset.index) : undefined
  }
  // The focus stays on the button while the mouse uses the list
  list.addEventListener('mousedown', (event) => event.preventDefault())
  list.addEventListener('mousemove', (event) => {
    const index = indexAt(event.target)
    if (index !== undefined && index !== active) setActive(index, false)
  })
  list.addEventListener('click', (event) => {
    const index = indexAt(event.target)
    if (index !== undefined) pick(index)
  })

  drawValue()

  return {
    element,
    button,
    setValue(next: string) {
      close()
      value = next
      drawValue()
    },
    setOptions(next: readonly SelectOption[]) {
      close()
      options = next
      drawValue()
    },
  }
}
