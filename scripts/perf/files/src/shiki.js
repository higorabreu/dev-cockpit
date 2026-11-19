// Syntax colors through VS Code's TextMate grammars (Shiki), as a CodeMirror plugin. It tokenizes line by
// line and keeps each line's end state, as VS Code does: an edit retokenizes from its line until a line
// ends in the state it ended in before, the visible lines are colored at once and the rest of the file is
// tokenized in small slices while the page is idle. Tokens are kept for the visible lines only.

import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, ViewPlugin } from '@codemirror/view'
import { createHighlighterCore } from '@shikijs/core'
import { EncodedTokenMetadata, INITIAL } from '@shikijs/vscode-textmate'

const grammars = {
  typescript: () => import('@shikijs/langs/typescript'),
  python: () => import('@shikijs/langs/python'),
}
const themes = {
  dark: () => import('@shikijs/themes/dark-plus'),
  light: () => import('@shikijs/themes/light-plus'),
}
const engines = {
  oniguruma: async () => {
    const { createOnigurumaEngine } = await import('@shikijs/engine-oniguruma')
    return createOnigurumaEngine(import('@shikijs/engine-oniguruma/wasm-inlined'))
  },
  javascript: async () => {
    const { createJavaScriptRegexEngine } = await import('@shikijs/engine-javascript')
    return createJavaScriptRegexEngine()
  },
}

// One slice of background work, then the page gets the thread back
const SLICE_MS = 5
// A line longer than this is left plain, as VS Code's editor.maxTokenizationLineLength
const MAX_LINE = 20000

export async function createShiki({ engine, language, theme }) {
  const highlighter = await createHighlighterCore({
    engine: engines[engine](),
    themes: [themes[theme]()],
    langs: [grammars[language]()],
  })
  const themeName = theme === 'dark' ? 'dark-plus' : 'light-plus'
  const { colorMap } = highlighter.setTheme(themeName)
  return { grammar: highlighter.getLanguage(language), colorMap, highlighter }
}

function styleSheet(colorMap) {
  const rules = colorMap.map((color, index) => `.sk-${index}{color:${color}}`)
  rules.push(
    '.sk-i{font-style:italic}',
    '.sk-b{font-weight:bold}',
    '.sk-u{text-decoration:underline}',
  )
  const style = document.createElement('style')
  style.textContent = rules.join('\n')
  document.head.append(style)
  return style
}

function markOf(metadata, marks) {
  const color = EncodedTokenMetadata.getForeground(metadata)
  const font = EncodedTokenMetadata.getFontStyle(metadata)
  const key = color * 16 + font
  let mark = marks.get(key)
  if (!mark) {
    const classes = [`sk-${color}`]
    if (font & 1) classes.push('sk-i')
    if (font & 2) classes.push('sk-b')
    if (font & 4) classes.push('sk-u')
    mark = Decoration.mark({ class: classes.join(' ') })
    marks.set(key, mark)
  }
  return mark
}

// onColored(stats) is called after each pass that colored the visible lines, and once the whole file is done
export function shikiColors({ grammar, colorMap }, onColored = () => {}) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view
        this.style = styleSheet(colorMap)
        this.marks = new Map()
        // ends[i] is the state after line i + 1 (undefined: not tokenized yet), tokens[i] its tokens while
        // the line is visible
        this.ends = []
        this.tokens = []
        this.shown = { first: 0, last: -1 }
        this.dirty = 0
        this.timer = undefined
        this.decorations = this.color(view)
        this.background()
      }

      tokenizeLine(index, doc) {
        const text = doc.line(index + 1).text
        const before = index === 0 ? INITIAL : this.ends[index - 1]
        const keep = index >= this.shown.first && index <= this.shown.last
        if (text.length > MAX_LINE) {
          this.tokens[index] = undefined
          this.ends[index] = before
          return
        }
        const result = grammar.tokenizeLine2(text, before, 500)
        this.tokens[index] = keep ? result.tokens : undefined
        this.ends[index] = result.ruleStack
      }

      // Tokenizes from the first stale line through `last`, stopping early once a line ends as it did
      tokenizeThrough(last, doc, deadline = Number.POSITIVE_INFINITY) {
        let count = 0
        while (this.dirty <= last && this.dirty < doc.lines) {
          const index = this.dirty
          const previous = this.ends[index]
          this.tokenizeLine(index, doc)
          count++
          this.dirty++
          if (previous?.equals(this.ends[index]) && this.stale === undefined) {
            this.dirty = this.ends.length
          }
          if (this.stale !== undefined && index >= this.stale) this.stale = undefined
          if (count % 64 === 0 && performance.now() > deadline) break
        }
        return count
      }

      color(view) {
        const started = performance.now()
        const doc = view.state.doc
        const builder = new RangeSetBuilder()
        let lines = 0
        const before = this.shown
        const ranges = view.visibleRanges.map(({ from, to }) => ({
          first: doc.lineAt(from).number - 1,
          last: doc.lineAt(to).number - 1,
        }))
        this.shown = { first: ranges[0]?.first ?? 0, last: ranges.at(-1)?.last ?? -1 }
        // Tokens of lines that left the view are dropped; the line states stay
        for (let index = before.first; index <= before.last; index++) {
          if (index < this.shown.first || index > this.shown.last) this.tokens[index] = undefined
        }
        for (const { first, last } of ranges) {
          lines += this.tokenizeThrough(last, doc)
          for (let index = first; index <= last; index++) {
            if (!this.tokens[index] && this.ends[index]) {
              this.tokenizeLine(index, doc)
              lines++
            }
            const tokens = this.tokens[index]
            if (!tokens) continue
            const line = doc.line(index + 1)
            const count = tokens.length / 2
            for (let j = 0; j < count; j++) {
              const start = tokens[2 * j]
              const end = j + 1 < count ? tokens[2 * j + 2] : line.length
              const metadata = tokens[2 * j + 1]
              // The default color and no font style need no mark, as VS Code draws them without one
              const plain =
                EncodedTokenMetadata.getForeground(metadata) === 1 &&
                EncodedTokenMetadata.getFontStyle(metadata) === 0
              if (end > start && !plain) {
                builder.add(line.from + start, line.from + end, markOf(metadata, this.marks))
              }
            }
          }
        }
        this.lastPass = { lines, ms: performance.now() - started }
        return builder.finish()
      }

      // Keeps the per-line arrays aligned with the new text and marks the first changed line stale
      shift(update) {
        let first = Number.POSITIVE_INFINITY
        const startDoc = update.startState.doc
        // Walk the changes from the end, so earlier line numbers stay valid while splicing
        const changes = []
        update.changes.iterChanges((fromA, toA, fromB, toB) =>
          changes.push({ fromA, toA, fromB, toB }),
        )
        for (const change of changes.reverse()) {
          const lineA = startDoc.lineAt(change.fromA).number - 1
          const endA = startDoc.lineAt(change.toA).number - 1
          const lineB = update.state.doc.lineAt(change.fromB).number - 1
          const endB = update.state.doc.lineAt(change.toB).number - 1
          const added = endB - lineB + 1
          const removed = endA - lineA + 1
          this.ends.splice(lineA, removed, ...new Array(added))
          this.tokens.splice(lineA, removed, ...new Array(added))
          first = Math.min(first, lineB)
          // Every inserted line must be retokenized before the early stop may apply
          this.stale = Math.max(this.stale ?? 0, endB)
        }
        this.dirty = Math.min(this.dirty, first)
      }

      update(update) {
        if (update.docChanged) this.shift(update)
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.color(update.view)
          onColored({ kind: update.docChanged ? 'edit' : 'scroll', ...this.lastPass })
          this.background()
        }
      }

      // The rest of the file in slices of SLICE_MS, so a jump anywhere finds it colored
      background() {
        clearTimeout(this.timer)
        const started = performance.now()
        const step = () => {
          const doc = this.view.state.doc
          if (this.dirty >= doc.lines) {
            onColored({ kind: 'file', ms: performance.now() - started, lines: doc.lines })
            return
          }
          this.tokenizeThrough(doc.lines - 1, doc, performance.now() + SLICE_MS)
          this.timer = setTimeout(step, 0)
        }
        this.timer = setTimeout(step, 0)
      }

      destroy() {
        clearTimeout(this.timer)
        this.style.remove()
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}
