import { searchItems, type Translate } from '@dck/core'
import { closeButton, keyHint } from '../kit/panel-frame.ts'
import { watchOverflow } from '../kit/scrollbar.ts'
import { h } from '../panel/dom.ts'
import type { Keymap } from '../platform/keymap.ts'

export interface SearchEntry {
  readonly path: string
  readonly label: string
  // Full path with ~, shown muted beside the name
  readonly location: string
  readonly favorite?: boolean
}

const PIN =
  '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></svg>'

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ENTITIES[char] ?? char)

export interface SearchElements {
  readonly overlay: HTMLElement
  readonly input: HTMLInputElement
  readonly results: HTMLElement
  readonly hint: HTMLElement
}

export interface SearchDeps {
  onPick(path: string): void
  onClose(): void
  onToggleFavorite(path: string): void
  // Opens the system folder picker; the search is opened again with the outcome
  onChooseRoot(): void
  readonly t: Translate
  readonly keymap: Keymap
}

// Project search: typing filters, the arrows choose, Enter opens, Esc closes
export function createProjectSearch(elements: SearchElements, deps: SearchDeps) {
  const { overlay, input, results, hint } = elements
  const { onPick, onClose, onToggleFavorite, t, keymap } = deps
  // No projects folder chosen yet: the search asks for one instead of guessing it
  let needsRoot = false
  // Pinning has nothing to act on before there are projects, so the bar goes away
  const drawHint = () => {
    hint.hidden = needsRoot
    hint.replaceChildren(
      ...(needsRoot ? [] : [keyHint(keymap.commandLabel('d'), t('projects.hint'))]),
    )
  }
  drawHint()
  watchOverflow(results)
  const row = h('div', { class: 'prow' })
  input.replaceWith(row)
  row.append(
    input,
    closeButton(t, () => close()),
  )
  let entries: readonly SearchEntry[] = []
  let matches: readonly SearchEntry[] = []
  let selected = 0

  const isOpen = () => overlay.classList.contains('open')

  function drawRootSetup() {
    const choose = h(
      'button',
      { type: 'button', class: 'pchoose', 'data-focus': 'projects-choose-root' },
      t('projects.chooseRoot'),
    )
    choose.addEventListener('click', () => deps.onChooseRoot())
    results.replaceChildren(
      h(
        'div',
        { class: 'psetup' },
        h('strong', {}, t('projects.noRoot.title')),
        h('span', {}, t('projects.noRoot.text')),
        choose,
      ),
    )
    return choose
  }

  function draw() {
    if (needsRoot) {
      drawRootSetup().focus()
      return
    }
    if (matches.length === 0) {
      results.innerHTML = `<div class="empty">${escapeHtml(t('projects.none'))}</div>`
      return
    }
    // Redrawing resets the scroll; without saving, the mouse wheel would lose its position on every key
    const scrolled = results.scrollTop
    results.innerHTML = matches
      .map(
        (entry, index) =>
          `<button type="button" class="it${index === selected ? ' on' : ''}" role="option" aria-selected="${index === selected}" data-index="${index}"><span class="l">${escapeHtml(entry.label)}</span><span class="p">${escapeHtml(entry.location)}</span>${entry.favorite ? `<span class="pin" data-tip="${escapeHtml(t('projects.pinned'))}">${PIN}</span>` : ''}</button>`,
      )
      .join('')
    results.scrollTop = scrolled
    results.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }

  function filter() {
    matches = searchItems(entries, input.value, (entry) => entry.label)
    selected = 0
    draw()
  }

  function close() {
    overlay.classList.remove('open')
    needsRoot = false
    input.disabled = false
    input.value = ''
    onClose()
  }

  function pick() {
    const entry = matches[selected]
    close()
    if (entry) onPick(entry.path)
  }

  input.addEventListener('input', filter)
  input.addEventListener('keydown', (event) => {
    const move = (step: number) => {
      if (matches.length === 0) return
      selected = (selected + step + matches.length) % matches.length
      draw()
    }
    if (event.key === 'Escape') close()
    else if (event.key === 'Enter') pick()
    else if (event.key === 'ArrowDown') move(1)
    else if (event.key === 'ArrowUp') move(-1)
    else if (keymap.command(event, 'd')) {
      const entry = matches[selected]
      if (entry) onToggleFavorite(entry.path)
    } else return
    event.preventDefault()
    event.stopPropagation()
  })
  results.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    const row = event.target.closest<HTMLElement>('[data-index]')
    if (!row) return
    selected = Number(row.dataset.index)
    pick()
  })
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close()
  })
  // The field handles its own keys; from the folder button Esc still closes
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.target === input || !isOpen()) return
    event.preventDefault()
    event.stopPropagation()
    close()
  })

  return {
    isOpen,
    open(items: readonly SearchEntry[]) {
      needsRoot = false
      input.disabled = false
      results.setAttribute('role', 'listbox')
      drawHint()
      entries = items
      overlay.classList.add('open')
      filter()
      input.focus()
    },
    // Opens on the empty state whose one action chooses the projects folder
    askForRoot() {
      needsRoot = true
      input.value = ''
      input.disabled = true
      // A notice with a button, not options to choose from
      results.removeAttribute('role')
      drawHint()
      overlay.classList.add('open')
      drawRootSetup().focus()
    },
    retranslate() {
      drawHint()
      if (isOpen()) draw()
    },
    // Updates the list keeping the typed text and the highlighted item, after pinning or unpinning
    update(items: readonly SearchEntry[]) {
      if (needsRoot) return
      const current = matches[selected]?.path
      entries = items
      matches = searchItems(entries, input.value, (entry) => entry.label)
      const kept = matches.findIndex((entry) => entry.path === current)
      selected = kept === -1 ? 0 : kept
      draw()
    },
  }
}
