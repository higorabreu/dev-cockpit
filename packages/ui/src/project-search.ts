import { searchItems, type Translate } from '@dck/core'

export interface SearchEntry {
  readonly path: string
  readonly label: string
  readonly favorite?: boolean
}

const VISIBLE_ROWS = 9
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

// Busca de projetos: digitar filtra, setas escolhem, Enter abre, Esc fecha
export function createProjectSearch(
  elements: SearchElements,
  onPick: (path: string) => void,
  onClose: () => void,
  onToggleFavorite: (path: string) => void,
  t: Translate,
) {
  const { overlay, input, results, hint } = elements
  hint.innerHTML = `<kbd>Ctrl+D</kbd> ${escapeHtml(t('projects.hint'))}`
  let entries: readonly SearchEntry[] = []
  let matches: readonly SearchEntry[] = []
  let selected = 0

  const isOpen = () => overlay.classList.contains('open')

  function draw() {
    if (matches.length === 0) {
      results.innerHTML = '<div class="empty">Nenhum projeto encontrado</div>'
      return
    }
    const start = Math.min(
      Math.max(selected - Math.floor(VISIBLE_ROWS / 2), 0),
      Math.max(matches.length - VISIBLE_ROWS, 0),
    )
    results.innerHTML = matches
      .slice(start, start + VISIBLE_ROWS)
      .map((entry, offset) => {
        const index = start + offset
        return `<button type="button" class="it${index === selected ? ' on' : ''}" role="option" aria-selected="${index === selected}" data-index="${index}"><span class="l">${escapeHtml(entry.label)}</span>${entry.favorite ? `<span class="pin" data-tip="${escapeHtml(t('projects.pinned'))}">${PIN}</span>` : ''}</button>`
      })
      .join('')
  }

  function filter() {
    matches = searchItems(entries, input.value, (entry) => entry.label)
    selected = 0
    draw()
  }

  function close() {
    overlay.classList.remove('open')
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
    else if (event.ctrlKey && event.key.toLowerCase() === 'd') {
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

  return {
    isOpen,
    open(items: readonly SearchEntry[]) {
      entries = items
      overlay.classList.add('open')
      filter()
      input.focus()
    },
    // Atualiza a lista mantendo o texto digitado e o item destacado, depois de fixar ou soltar
    update(items: readonly SearchEntry[]) {
      const current = matches[selected]?.path
      entries = items
      matches = searchItems(entries, input.value, (entry) => entry.label)
      const kept = matches.findIndex((entry) => entry.path === current)
      selected = kept === -1 ? 0 : kept
      draw()
    },
  }
}
