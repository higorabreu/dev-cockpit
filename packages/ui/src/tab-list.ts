import { searchItems, type Translate } from '@dck/core'
import { h, icon } from './panel/dom.ts'

export interface TabListEntry {
  readonly id: string
  readonly label: string
  readonly current: boolean
  readonly finished: boolean
}

export interface TabListDeps {
  entries(): readonly TabListEntry[]
  onPick(id: string): void
  onClose(): void
  // True when the tab bar is at the top and the list opens downward
  barOnTop(): boolean
  t: Translate
}

const CHECK = '<path d="M5 12.5l4.5 4.5L19 7"/>'

// Searchable list of all tabs, anchored to the button at the end of the bar
export function createTabList(panel: HTMLElement, button: HTMLElement, deps: TabListDeps) {
  const { t } = deps
  let matches: readonly TabListEntry[] = []
  let selected = 0

  const input = h('input', {
    type: 'text',
    class: 'tl-input',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('tabs.search'),
    placeholder: t('tabs.search'),
  })
  const list = h('div', { class: 'tl-list scroll', role: 'listbox' })
  panel.replaceChildren(input, list)

  const isOpen = () => !panel.hidden

  function draw() {
    if (matches.length === 0) {
      list.replaceChildren(h('div', { class: 'empty' }, t('tabs.none')))
      return
    }
    list.replaceChildren(
      ...matches.map((entry, index) =>
        h(
          'button',
          {
            type: 'button',
            class: index === selected ? 'tl-row on' : 'tl-row',
            role: 'option',
            'aria-selected': String(index === selected),
            'aria-current': entry.current ? 'true' : undefined,
            'data-index': String(index),
          },
          h('span', { class: 'tl-label' }, entry.label),
          entry.finished &&
            h('span', { class: 'tl-flag' }, h('i', { class: 'pip' }), t('tabs.finished')),
          entry.current && icon(CHECK, 13),
        ),
      ),
    )
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }

  function filter() {
    matches = searchItems(deps.entries(), input.value, (entry) => entry.label)
  }

  function place() {
    const anchor = button.getBoundingClientRect()
    const { width, height } = panel.getBoundingClientRect()
    const left = Math.max(4, Math.min(anchor.right - width, window.innerWidth - width - 4))
    const top = deps.barOnTop() ? anchor.bottom + 6 : anchor.top - height - 6
    panel.style.left = `${Math.round(left)}px`
    panel.style.top = `${Math.round(Math.max(4, top))}px`
  }

  function close() {
    if (!isOpen()) return
    panel.hidden = true
    input.value = ''
    deps.onClose()
  }

  function open() {
    input.value = ''
    filter()
    selected = Math.max(
      matches.findIndex((entry) => entry.current),
      0,
    )
    panel.hidden = false
    draw()
    place()
    input.focus()
  }

  function pick(index: number) {
    const entry = matches[index]
    close()
    if (entry) deps.onPick(entry.id)
  }

  input.addEventListener('input', () => {
    filter()
    selected = 0
    draw()
  })
  input.addEventListener('keydown', (event) => {
    const move = (step: number) => {
      if (matches.length === 0) return
      selected = (selected + step + matches.length) % matches.length
      draw()
    }
    if (event.key === 'Escape') close()
    else if (event.key === 'Enter') pick(selected)
    else if (event.key === 'ArrowDown') move(1)
    else if (event.key === 'ArrowUp') move(-1)
    else return
    event.preventDefault()
    event.stopPropagation()
  })
  list.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    const row = event.target.closest<HTMLElement>('[data-index]')
    if (row) pick(Number(row.dataset.index))
  })
  // The button toggles by itself; handling the click on it here would close it and the click would reopen it
  window.addEventListener(
    'mousedown',
    (event) => {
      const target = event.target as Node
      if (isOpen() && !panel.contains(target) && !button.contains(target)) close()
    },
    true,
  )
  button.addEventListener('click', () => (isOpen() ? close() : open()))

  return { isOpen, close }
}
