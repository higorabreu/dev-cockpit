import { Compartment, EditorState, Text } from '@codemirror/state'
import { Decoration, EditorView, lineNumbers } from '@codemirror/view'
import { diffLines, type LineEnding, splitLines } from '@dck/core'
import { h } from '../panel/dom.ts'
import { languageFor, syntaxColors } from './editor-syntax.ts'
import { cockpitTheme } from './editor-theme.ts'

export interface CompareOptions {
  readonly parent: HTMLElement
  readonly path: string
  readonly disk: string
  readonly mine: string
  readonly lineEnding: LineEnding
  readonly colors: boolean
  readonly labels: { readonly disk: string; readonly mine: string }
}

// Past this many changed lines the columns show without tints rather than run a long diff
const MAX_DIFF_EDITS = 5000

const removed = Decoration.line({ class: 'cm-compare-removed' })
const added = Decoration.line({ class: 'cm-compare-added' })

// One side, read only, its changed lines [from, to) (from 0) tinted
function column(
  options: CompareOptions,
  text: string,
  ranges: readonly (readonly [number, number])[],
  mark: Decoration,
) {
  const separator = options.lineEnding === 'crlf' ? '\r\n' : '\n'
  const doc = Text.of(text.split(separator))
  const lines = ranges.flatMap(([from, to]) =>
    Array.from({ length: to - from }, (_, index) => from + index + 1),
  )
  const tints = Decoration.set(
    lines.filter((line) => line <= doc.lines).map((line) => mark.range(doc.line(line).from)),
  )
  const language = new Compartment()
  const host = h('div', { class: 'fv-compare-text' })
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      extensions: [
        EditorState.lineSeparator.of(separator),
        EditorState.readOnly.of(true),
        lineNumbers(),
        cockpitTheme,
        options.colors ? syntaxColors : [],
        language.of([]),
        EditorView.decorations.of(tints),
      ],
    }),
  })
  view.scrollDOM.classList.add('scroll')
  if (options.colors)
    void languageFor(options.path).then((support) => {
      if (support) view.dispatch({ effects: language.reconfigure(support) })
    })
  return { host, view }
}

// The disk's version and the user's side by side, read only, the lines that differ tinted (a two-column
// view; picking hunk by hunk from three versions comes later)
export function createCompare(options: CompareOptions) {
  const hunks = diffLines(splitLines(options.disk), splitLines(options.mine), MAX_DIFF_EDITS) ?? []
  const left = column(
    options,
    options.disk,
    hunks.map((hunk) => [hunk.aStart, hunk.aEnd] as const),
    removed,
  )
  const right = column(
    options,
    options.mine,
    hunks.map((hunk) => [hunk.bStart, hunk.bEnd] as const),
    added,
  )
  const side = (label: string, host: HTMLElement) =>
    h('div', { class: 'fv-compare-side' }, h('div', { class: 'fv-compare-label' }, label), host)
  const element = h(
    'div',
    { class: 'fv-compare' },
    side(options.labels.disk, left.host),
    side(options.labels.mine, right.host),
  )
  options.parent.append(element)
  return {
    destroy() {
      left.view.destroy()
      right.view.destroy()
      element.remove()
    },
  }
}
