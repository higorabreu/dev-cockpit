import {
  commentSpan,
  type DiffLine,
  isOutdated,
  QUOTED_LINES,
  type ReviewComment,
  type Translator,
} from '@dck/core'
import { h, icon } from '../panel/dom.ts'

// The comment field's row: 8px of air, the label, a four-line field, the buttons and 8px of air
export const EDITOR_HEIGHT = 150
// A card before it is measured: air, its head, its text and its quote at 18px a line
const CARD_CHROME = 52
const CARD_LINE = 18

const ICONS = {
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  delete: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
} as const

const SIGN = { context: ' ', add: '+', remove: '−' } as const

// "Line 13", "Lines 13-14", or the old numbers of removed lines
export function linesLabel(lines: readonly DiffLine[], i18n: Translator): string {
  const { from, to, removed } = commentSpan(lines)
  if (from === to)
    return i18n.t(removed ? 'review.lines.removedOne' : 'review.lines.one', { line: from })
  return i18n.t(removed ? 'review.lines.removedRange' : 'review.lines.range', { from, to })
}

export function commentLabel(comment: ReviewComment, i18n: Translator): string {
  const params = { lines: linesLabel(comment.lines, i18n), text: comment.body.trim() }
  return isOutdated(comment)
    ? i18n.t('review.a11y.outdatedComment', params)
    : i18n.t('review.a11y.comment', params)
}

// An outdated comment no longer sits under its lines, so it quotes them as they were
const quoted = (comment: ReviewComment) =>
  isOutdated(comment) ? comment.lines.slice(0, QUOTED_LINES) : []

export function cardEstimate(comment: ReviewComment): number {
  const lines = comment.body.split('\n').length + quoted(comment).length
  return CARD_CHROME + lines * CARD_LINE
}

export interface CommentCardDeps {
  readonly i18n: Translator
  // The keys that act on the comment at the diff's cursor, for the buttons' tooltips
  readonly editKey: string
  readonly deleteKey: string
  edit(id: string): void
  remove(id: string): void
}

function cardButton(svg: string, name: string, key: string, run: () => void): HTMLElement {
  const button = h(
    'button',
    {
      type: 'button',
      class: 'rv-icon rv-card-action',
      tabindex: '-1',
      'aria-label': name,
      'data-tip': name,
      'data-tip-key': key,
    },
    icon(svg, 14),
  )
  // The keys stay on the diff, where Enter and Delete do the same
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    run()
  })
  return button
}

// A pending comment under its lines: which lines, "Outdated" when they are gone, the text, edit and
// delete; with `path` when its file left the change
export function commentCard(
  comment: ReviewComment,
  withPath: boolean,
  deps: CommentCardDeps,
): HTMLElement {
  const { i18n } = deps
  const lines = linesLabel(comment.lines, i18n)
  const quote = quoted(comment)
  return h(
    'div',
    { class: 'rv-card', 'data-outdated': String(isOutdated(comment)) },
    h(
      'div',
      { class: 'rv-card-head' },
      withPath && h('span', { class: 'rv-card-path' }, comment.path),
      h('span', { class: 'rv-card-lines' }, lines),
      isOutdated(comment) &&
        h('span', { class: 'rv-label rv-outdated' }, i18n.t('review.comment.outdated')),
      h('span', { class: 'rv-spacer' }),
      cardButton(ICONS.edit, i18n.t('review.comment.edit'), deps.editKey, () =>
        deps.edit(comment.id),
      ),
      cardButton(ICONS.delete, i18n.t('review.comment.delete'), deps.deleteKey, () =>
        deps.remove(comment.id),
      ),
    ),
    quote.length > 0 &&
      h(
        'div',
        { class: 'rv-card-quote', 'aria-hidden': 'true' },
        ...quote.map((line) =>
          h('div', { 'data-kind': line.kind }, `${SIGN[line.kind]} ${line.text}`),
        ),
      ),
    h('div', { class: 'rv-card-body' }, comment.body.trim()),
  )
}

export interface CommentEditorDeps {
  readonly i18n: Translator
  // Ctrl+Enter, or Cmd+Enter on the Mac
  readonly saveKey: string
  isSave(event: KeyboardEvent): boolean
  save(text: string): void
  cancel(): void
}

// The comment field: Ctrl+Enter saves, Esc cancels, and an empty comment cannot be saved. Its keys stay
// in the field, away from the review's own
export function createCommentEditor(
  comment: ReviewComment,
  existing: boolean,
  deps: CommentEditorDeps,
) {
  const { i18n } = deps
  const label = i18n.t('review.comment.field', { lines: linesLabel(comment.lines, i18n) })
  const field = h('textarea', {
    class: 'rv-field',
    rows: '4',
    'aria-label': label,
    placeholder: i18n.t('review.comment.placeholder'),
  })
  field.value = comment.body
  const cancel = h(
    'button',
    { type: 'button', class: 'vbtn', 'data-tip-key': 'Esc' },
    i18n.t('review.comment.cancel'),
  )
  const save = h(
    'button',
    { type: 'button', class: 'vbtn rv-primary', 'data-tip-key': deps.saveKey },
    i18n.t(existing ? 'review.comment.update' : 'review.comment.save'),
  )
  const element = h(
    'div',
    { class: 'rv-editor' },
    h('div', { class: 'rv-card-head' }, h('span', { class: 'rv-card-lines' }, label)),
    field,
    h('div', { class: 'rv-editor-actions' }, cancel, save),
  )
  const empty = () => field.value.trim() === ''
  const drawSave = () => {
    save.toggleAttribute('disabled', empty())
  }
  const trySave = () => {
    if (!empty()) deps.save(field.value)
  }
  field.addEventListener('input', drawSave)
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') deps.cancel()
    else if (deps.isSave(event)) trySave()
    else {
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
  })
  element.addEventListener('click', (event) => event.stopPropagation())
  cancel.addEventListener('click', () => deps.cancel())
  save.addEventListener('click', trySave)
  drawSave()
  return {
    element,
    text: () => field.value,
    focus() {
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    },
  }
}

export type CommentEditor = ReturnType<typeof createCommentEditor>
