import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentUnit } from '@codemirror/language'
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
  StateEffect,
  StateField,
  Transaction,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import type { EditorConfig, LineEdit, LineEnding, LineRange } from '@dck/core'
import { timerBlink } from './editor-blink.ts'
import { bracketsAndDocTags, indentGuides } from './editor-extras.ts'
import { type GoToTexts, goToLineBar, openGoToLine } from './editor-goto.ts'
import { openFind, type SearchTexts, searchBar } from './editor-search.ts'
import { languageFor, syntaxColors } from './editor-syntax.ts'
import { cockpitTheme } from './editor-theme.ts'
import { changedSpan, guessIndent } from './line-span.ts'

export { highlightCode } from './code-highlight.ts'
export type { GoToTexts, SearchTexts }

export interface CodeEditorOptions {
  readonly parent: HTMLElement
  readonly path: string
  readonly text: string
  readonly lineEnding: LineEnding
  readonly readOnly: boolean
  // Syntax colors: only up to FILE_LIMITS.colorBytes
  readonly colors: boolean
  readonly config: EditorConfig
  readonly mac: boolean
  // The editor's accessible name
  readonly label: string
  // CodeMirror's own words (the go to line bar, what a screen reader hears), from the catalogs
  readonly phrases: Readonly<Record<string, string>>
  searchTexts(): SearchTexts
  goToTexts(): GoToTexts
  // A change the user made, never one of reload, merge or the final newline
  onUserChange(): void
  // Any change of the text, the cockpit's own included (a Markdown preview beside it follows)
  onTextChange?(): void
  // Ctrl+S (⌘S)
  onSave(): void
}

export interface CodeEditor {
  text(): string
  focus(): void
  hasFocus(): boolean
  // The whole text again, rewriting only the lines that differ; outside the user's undo history unless
  // the user asked for it (Reload in a conflict, which Ctrl+Z takes back)
  reload(text: string, undoable?: boolean): void
  // A merge's edits by lines of the current text, outside the user's undo history
  applyLineEdits(edits: readonly LineEdit[]): void
  // Lines of the current text, from 0, tinted for a while (the lines a merge took from the disk)
  markLines(ranges: readonly LineRange[], milliseconds: number): void
  // From 1; the cursor goes to the line's start, in the middle of the view
  // The column too when a compiler named one, both from 1, scrolled to the middle
  goToLine(line: number, column?: number): void
  // From 1: the first line in view, and a line brought to the top of the view (the Markdown preview keeps
  // the nearest heading in view when the user switches)
  topLine(): number
  scrollToLine(line: number): void
  // `.editorconfig`'s insert_final_newline: true when a line break was added
  ensureFinalNewline(): boolean
  setReadOnly(readOnly: boolean): void
  // The search bar and the go to line bar, as their keys open them: never a toggle, Esc closes them
  find(): void
  askLine(): void
  destroy(): void
}

// Marks a change the cockpit made, so it is not taken for typing
const external = Annotation.define<boolean>()

const setMarks = StateEffect.define<DecorationSet>()
const fromDiskLine = Decoration.line({ class: 'cm-from-disk' })
const marks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes)
    for (const effect of transaction.effects) if (effect.is(setMarks)) next = effect.value
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

// CodeMirror keeps one line break for the whole text: CRLF stays CRLF; in a file that mixes them the
// carriage returns stay in the text as characters, so the bytes come back as they were read
const separatorOf = (ending: LineEnding) => (ending === 'crlf' ? '\r\n' : '\n')

function indentationOf(config: EditorConfig, text: string): Extension {
  const tabSize = config.tabWidth ?? config.indentSize ?? 4
  const unit =
    config.indentStyle === 'tab'
      ? '\t'
      : config.indentStyle === 'space'
        ? ' '.repeat(config.indentSize ?? 2)
        : guessIndent(text)
  // The indent guides step by the unit's columns (editor-theme.ts)
  const columns = unit === '\t' ? tabSize : unit.length
  return [
    EditorState.tabSize.of(tabSize),
    indentUnit.of(unit),
    EditorView.contentAttributes.of({ style: `--indent-columns: ${columns}` }),
  ]
}

const lineStart = (state: EditorState, line: number) =>
  line < state.doc.lines ? state.doc.line(line + 1).from : state.doc.length

interface Change {
  readonly from: number
  readonly to: number
  readonly insert: string
}

// The merge's edits as positions of the editor's text
export const lineEditChanges = (state: EditorState, edits: readonly LineEdit[]): Change[] =>
  edits.map((edit) => ({
    from: lineStart(state, edit.fromLine),
    to: lineStart(state, edit.toLine),
    insert: edit.insert,
  }))

// The one change that turns the editor's text into `text`, rewriting only the lines between those both
// share at the start and at the end; undefined when they are the same
export function reloadChange(state: EditorState, text: string): Change | undefined {
  const { doc, lineBreak } = state
  const before = Array.from(doc.iterLines())
  const after = text.split(lineBreak)
  const { start, endBefore, endAfter } = changedSpan(before, after)
  if (start === endBefore && start === endAfter) return undefined
  if (endBefore < before.length) {
    const insert = after
      .slice(start, endAfter)
      .map((line) => line + lineBreak)
      .join('')
    return { from: doc.line(start + 1).from, to: doc.line(endBefore + 1).from, insert }
  }
  // Up to the end: the last line has no break of its own, so the one before it goes with the change
  const rest = after.slice(start)
  const insert = rest.length === 0 ? '' : (start > 0 ? lineBreak : '') + rest.join(lineBreak)
  return { from: start > 0 ? doc.line(start).to : 0, to: doc.length, insert }
}

export function createCodeEditor(options: CodeEditorOptions): CodeEditor {
  const readOnly = new Compartment()
  const language = new Compartment()
  const save = () => {
    options.onSave()
    return true
  }
  const state = EditorState.create({
    doc: options.text,
    extensions: [
      EditorState.lineSeparator.of(separatorOf(options.lineEnding)),
      EditorState.phrases.of(options.phrases),
      indentationOf(options.config, options.text),
      readOnly.of(EditorState.readOnly.of(options.readOnly)),
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection({ cursorBlinkRate: 0 }),
      timerBlink,
      bracketMatching(),
      searchBar(options.mac, options.searchTexts),
      goToLineBar(options.goToTexts),
      keymap.of([
        { key: 'Mod-s', run: save, preventDefault: true },
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      options.colors ? [syntaxColors, bracketsAndDocTags] : [],
      indentGuides,
      language.of([]),
      marks,
      cockpitTheme,
      EditorView.contentAttributes.of({ 'aria-label': options.label }),
      EditorView.updateListener.of((update) => {
        const typed = update.transactions.some(
          (transaction) => transaction.docChanged && !transaction.annotation(external),
        )
        if (typed) options.onUserChange()
        if (update.docChanged) options.onTextChange?.()
      }),
    ],
  })
  const view = new EditorView({ state, parent: options.parent })
  // The design system's scrollbar, as every list of the cockpit
  view.scrollDOM.classList.add('scroll')
  if (options.colors)
    void languageFor(options.path).then((support) => {
      if (support) view.dispatch({ effects: language.reconfigure(support) })
    })

  const quietly = (changes: readonly Change[], undoable = false) =>
    view.dispatch({
      changes,
      annotations: [external.of(true), Transaction.addToHistory.of(undoable)],
    })

  return {
    text: () => view.state.sliceDoc(),
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    reload(text, undoable) {
      const change = reloadChange(view.state, text)
      if (change) quietly([change], undoable)
    },
    applyLineEdits: (edits) => quietly(lineEditChanges(view.state, edits)),
    markLines(ranges, milliseconds) {
      const { doc } = view.state
      const lines = ranges.flatMap((range) =>
        Array.from({ length: range.to - range.from }, (_, index) => range.from + index + 1),
      )
      const set = Decoration.set(
        lines
          .filter((line) => line <= doc.lines)
          .map((line) => fromDiskLine.range(doc.line(line).from)),
      )
      view.dispatch({ effects: setMarks.of(set) })
      const first = lines[0]
      if (first !== undefined && first <= doc.lines)
        view.dispatch({ effects: EditorView.scrollIntoView(doc.line(first).from, { y: 'center' }) })
      setTimeout(() => view.dispatch({ effects: setMarks.of(Decoration.none) }), milliseconds)
    },
    goToLine(line, column = 1) {
      const { doc } = view.state
      const target = doc.line(Math.max(1, Math.min(line, doc.lines)))
      const at = target.from + Math.max(0, Math.min(column - 1, target.length))
      view.dispatch({
        selection: EditorSelection.cursor(at),
        effects: EditorView.scrollIntoView(at, { y: 'center' }),
      })
    },
    topLine() {
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
      return view.state.doc.lineAt(block.from).number
    },
    scrollToLine(line) {
      const { doc } = view.state
      const target = doc.line(Math.max(1, Math.min(line, doc.lines)))
      view.dispatch({ effects: EditorView.scrollIntoView(target.from, { y: 'start' }) })
    },
    ensureFinalNewline() {
      const { doc, lineBreak } = view.state
      if (doc.length === 0 || doc.line(doc.lines).length === 0) return false
      quietly([{ from: doc.length, to: doc.length, insert: lineBreak }])
      return true
    },
    setReadOnly(value) {
      view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(value)) })
    },
    find() {
      openFind(view)
    },
    askLine() {
      openGoToLine(view)
    },
    destroy: () => view.destroy(),
  }
}
