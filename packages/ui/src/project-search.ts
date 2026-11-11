import { searchItems } from '@dck/core'

export interface SearchEntry {
  readonly path: string
  readonly label: string
}

const VISIBLE_ROWS = 9

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ENTITIES[char] ?? char)

export interface SearchElements {
  readonly overlay: HTMLElement
  readonly input: HTMLInputElement
  readonly results: HTMLElement
}

// Busca de projetos: digitar filtra, setas escolhem, Enter abre, Esc fecha
export function createProjectSearch(
  elements: SearchElements,
  onPick: (path: string) => void,
  onClose: () => void,
) {
  const { overlay, input, results } = elements
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
        return `<button type="button" class="it${index === selected ? ' on' : ''}" role="option" aria-selected="${index === selected}" data-index="${index}"><span class="l">${escapeHtml(entry.label)}</span></button>`
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
    else return
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
  }
}
