// The editor as the file view would mount it: CodeMirror 6 with history, search, line numbers and the
// cockpit's own colors and font, its cursor blinking by a timer as the terminal's does (D58).
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState, Prec } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  ViewPlugin,
} from '@codemirror/view'

export { EditorState, EditorView, Prec }

const BLINK_MS = 500
const CURSOR_OFF = 'cm-cursor-off'

// CodeMirror's own blink is a CSS animation that keeps a frame running (D58); this toggles a class twice
// a second while focused and restarts on every change of the text or the selection
const timerBlink = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      this.timer = undefined
      this.restart()
    }
    restart() {
      clearTimeout(this.timer)
      this.view.dom.classList.remove(CURSOR_OFF)
      if (!this.view.hasFocus || document.hidden) return
      const tick = () => {
        this.view.dom.classList.toggle(CURSOR_OFF)
        this.timer = setTimeout(tick, BLINK_MS)
      }
      this.timer = setTimeout(tick, BLINK_MS)
    }
    update(update) {
      if (update.docChanged || update.selectionSet || update.focusChanged) this.restart()
    }
    destroy() {
      clearTimeout(this.timer)
    }
  },
)

const cockpitTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'var(--bg)',
    fontSize: 'var(--font-size-terminal, 13px)',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
  '.cm-content': { caretColor: 'var(--fg)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  '&.cm-cursor-off .cm-cursorLayer': { visibility: 'hidden' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--line-selected, var(--line))',
  },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-searchMatch': { backgroundColor: 'var(--diff-add-word)' },
})

// blink: 'timer' (the plan), 'css' (CodeMirror's default animation) or 'off'
export function createEditor({ parent, doc, extensions = [], blink = 'timer' }) {
  const state = EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection({ cursorBlinkRate: blink === 'css' ? 1200 : 0 }),
      blink === 'timer' ? timerBlink : [],
      search({ top: true }),
      highlightSelectionMatches(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      cockpitTheme,
      ...extensions,
    ],
  })
  return new EditorView({ state, parent })
}
