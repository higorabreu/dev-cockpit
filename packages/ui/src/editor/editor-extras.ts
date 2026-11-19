import { getIndentUnit, syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'

const OPENERS = new Set(['(', '[', '{'])
const BRACKETS = new Set(['(', ')', '[', ']', '{', '}'])
// Three colors by depth, repeating (tokens.json `syntax.bracket1` to `bracket3`)
const DEPTHS = 3
const bracketMarks = Array.from({ length: DEPTHS }, (_, depth) =>
  Decoration.mark({ class: `cm-bracket-${depth + 1}` }),
)
const docTag = Decoration.mark({ class: 'cm-doc-tag' })
const DOC_TAG = /(?<=^|[\s*{])@[A-Za-z]+/g

// How many bracketed nodes hold this one: a bracket's own pair is its parent, so the outermost pair is 0
function depthOf(node: SyntaxNode): number {
  let depth = -1
  for (let parent = node.parent; parent; parent = parent.parent) {
    const first = parent.firstChild
    if (first && OPENERS.has(first.name)) depth++
  }
  return Math.max(0, depth)
}

const isComment = (name: string) => /comment/i.test(name)

// Brackets colored by depth and a doc comment's tags (`@param`), read from the parse tree of the lines on
// screen only, so a large file costs what its view shows
function syntaxMarks(view: EditorView): DecorationSet {
  const marks: Range<Decoration>[] = []
  const tree = syntaxTree(view.state)
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (BRACKETS.has(node.name) && node.to - node.from === 1) {
          const mark = bracketMarks[depthOf(node.node) % DEPTHS]
          if (mark) marks.push(mark.range(node.from, node.to))
        } else if (isComment(node.name)) {
          const text = view.state.sliceDoc(node.from, node.to)
          for (const match of text.matchAll(DOC_TAG)) {
            const start = node.from + (match.index ?? 0)
            marks.push(docTag.range(start, start + match[0].length))
          }
          return false
        }
        return undefined
      },
    })
  }
  return Decoration.set(marks, true)
}

export const bracketsAndDocTags = ViewPlugin.define(
  (view) => {
    let decorations = syntaxMarks(view)
    return {
      get decorations() {
        return decorations
      },
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        )
          decorations = syntaxMarks(update.view)
      },
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

// The columns a line's indentation takes, a tab counting to the next tab stop; undefined for a blank line
function indentColumns(text: string, tabSize: number): number | undefined {
  let columns = 0
  for (const char of text) {
    if (char === ' ') columns++
    else if (char === '\t') columns += tabSize - (columns % tabSize)
    else return columns
  }
  return undefined
}

const guideMarks = new Map<number, Decoration>()
const guidesFor = (levels: number) => {
  let mark = guideMarks.get(levels)
  if (!mark) {
    mark = Decoration.line({ class: 'cm-guides', attributes: { style: `--guides: ${levels}` } })
    guideMarks.set(levels, mark)
  }
  return mark
}

// A blank line takes the guides of the next line with text, as far as a short look ahead goes
const LOOK_AHEAD = 100

function levelsOf(state: EditorState, lineNumber: number, unit: number): number {
  const { doc, tabSize } = state
  for (let next = lineNumber; next <= Math.min(doc.lines, lineNumber + LOOK_AHEAD); next++) {
    const columns = indentColumns(doc.line(next).text, tabSize)
    if (columns !== undefined) return Math.floor(columns / unit)
  }
  return 0
}

// One 1px line per indent level (styles/editor.css draws them from `--guides`), for the lines on screen
function guides(view: EditorView): DecorationSet {
  const { state } = view
  const unit = Math.max(1, getIndentUnit(state))
  const marks: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    for (let position = from; position <= to; ) {
      const line = state.doc.lineAt(position)
      const levels = levelsOf(state, line.number, unit)
      if (levels > 0) marks.push(guidesFor(levels).range(line.from))
      position = line.to + 1
    }
  }
  return Decoration.set(marks)
}

export const indentGuides = ViewPlugin.define(
  (view) => {
    let decorations = guides(view)
    return {
      get decorations() {
        return decorations
      },
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) decorations = guides(update.view)
      },
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
