import type { MessageKey, OpenedFile, Translator } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import { sizeText } from '../review/file-head.ts'
import type { PathParts } from './path-parts.ts'
import { createStripSlot } from './strip-slot.ts'

const TERMINAL =
  '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15H17"/>'
const FIND = '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'
const LINE = '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>'
const FILE =
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'

export interface FileViewDeps {
  readonly i18n: Translator
  // The header's terminal button: back to the terminal, as the toggle key does
  showTerminal(): void
  openExternal(path: string): void
  // The editor's search and go to line, for the mouse; their keys are fixed by the editor
  find(): void
  goToLine(): void
  readonly keys: { readonly find: string; readonly goToLine: string }
}

// What the header says beside the path: why the file is read only, or why it shows without colors
export type FileNote =
  | { readonly kind: 'read-only'; readonly reason: 'large' | 'encoding' }
  | { readonly kind: 'no-colors' }

export interface FileHead {
  readonly path: string
  // An editor shows the file, so the header offers its search and go to line
  readonly editing: boolean
  readonly parts: PathParts
  readonly ignored: boolean
  readonly note: FileNote | undefined
}

const CARD_KINDS: Readonly<Record<string, MessageKey>> = {
  image: 'files.card.image',
  pdf: 'files.card.pdf',
  binary: 'files.card.binary',
  'too-large': 'files.card.tooLarge',
}

// A file over a tab: a header with its path, a strip when the disk changed under it, and its body (the
// editor, a card, or the comparison). It covers the tab's panes, which stay alive underneath
export function createFileView(host: HTMLElement, deps: FileViewDeps) {
  const t = deps.i18n.t
  const head = h('div', { class: 'fv-head' })
  const body = h('div', { class: 'fv-body' })
  // What a viewer puts in the header: its controls (zoom, Edit and Preview) and a word on the file (its
  // pixel size); kept across the header's redraws
  const tools = h('span', { class: 'fv-tools-slot' })
  const infoSlot = h('span', { class: 'fv-info' })
  const element = h('section', { class: 'file-view', tabindex: '-1', hidden: true }, head)
  const strip = createStripSlot(element)
  element.append(strip.element, body)
  host.append(element)
  let current: FileHead | undefined

  function external(path: string) {
    const button = h('button', { type: 'button', class: 'fv-link' }, t('files.openExternal'))
    button.addEventListener('click', () => deps.openExternal(path))
    return button
  }

  function noteText(note: FileNote, size: string) {
    if (note.kind === 'no-colors') return t('files.noColors', { size })
    return note.reason === 'large'
      ? t('files.readOnly.large', { size })
      : t('files.readOnly.encoding')
  }

  function renderHead(info: FileHead, limit: string) {
    current = info
    const terminal = h(
      'button',
      {
        type: 'button',
        class: 'fv-icon',
        'aria-label': t('files.showTerminal'),
        'data-tip': t('files.showTerminal'),
        'data-tip-shortcut': 'toggleFile',
      },
      icon(TERMINAL, 16),
    )
    terminal.addEventListener('click', deps.showTerminal)
    const tool = (svg: string, label: string, key: string, run: () => void) => {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'fv-icon',
          'aria-label': label,
          'data-tip': label,
          'data-tip-key': key,
        },
        icon(svg, 15),
      )
      button.addEventListener('click', run)
      return button
    }
    const folders = info.parts.folders.map((folder) => `${folder} / `).join('')
    const parts = [
      h(
        'span',
        { class: 'fv-path', 'data-tip-full': info.path },
        h('span', { class: 'fv-folders' }, folders),
        h('span', { class: 'fv-name' }, info.parts.name),
      ),
      info.ignored && h('span', { class: 'fv-flag' }, t('files.ignored')),
      info.note && h('span', { class: 'fv-note' }, noteText(info.note, limit)),
      info.note?.kind === 'read-only' && external(info.path),
      infoSlot,
      h('span', { class: 'fv-spacer' }),
      tools,
      info.editing && tool(FIND, t('files.search.find'), deps.keys.find, deps.find),
      info.editing && tool(LINE, t('files.phrase.goToLine'), deps.keys.goToLine, deps.goToLine),
      terminal,
    ]
    head.replaceChildren(
      ...parts.filter((part): part is HTMLElement => part instanceof HTMLElement),
    )
  }

  return {
    element,
    body,
    tools,
    renderHead,
    setInfo(text: string) {
      infoSlot.textContent = text
    },
    current: () => current,
    setStrip: strip.set,
    // A kind the editor does not take, or a file past the limit: what it is, its size, and the way out
    showCard(file: OpenedFile, detail?: string) {
      const kind = detail ?? t(CARD_KINDS[file.kind] ?? 'files.card.binary')
      body.replaceChildren(
        h(
          'div',
          { class: 'fv-card' },
          icon(FILE, 28),
          h('span', { class: 'fv-card-name' }, current?.parts.name ?? ''),
          h(
            'span',
            { class: 'fv-card-kind' },
            t('files.card.size', { kind, size: sizeText(deps.i18n, file.size) }),
          ),
          external(file.path),
        ),
      )
    },
    showMessage(text: string) {
      body.replaceChildren(
        h('div', { class: 'fv-card' }, icon(FILE, 28), h('span', { class: 'fv-card-kind' }, text)),
      )
    },
    setShown(shown: boolean) {
      element.hidden = !shown
      host.toggleAttribute('data-file-shown', shown)
    },
    isShown: () => !element.hidden,
    dispose() {
      host.removeAttribute('data-file-shown')
      element.remove()
    },
  }
}

export type FileView = ReturnType<typeof createFileView>
