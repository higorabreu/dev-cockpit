import { EditorView } from '@codemirror/view'

// CodeMirror's chrome in the cockpit's tokens. A theme, not a stylesheet in styles/: CodeMirror's base
// theme scopes its rules with a generated class, and only a theme of its own comes after it with the same
// weight. The search bar and the view around the editor are styled in styles/editor.css
export const cockpitTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'transparent',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--editor-font-family, var(--font-mono))',
    fontSize: 'var(--editor-font-size, var(--font-size-terminal))',
    lineHeight: '1.5',
    fontVariantLigatures: 'contextual common-ligatures',
  },
  '.cm-content': { caretColor: 'var(--fg)', padding: '8px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--fg)' },
  '&.cm-cursor-off .cm-cursorLayer': { visibility: 'hidden' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 14px 0 12px' },
  // Room for three digits whatever the file's length, so the text never moves sideways at line 10 or 100
  '.cm-gutter.cm-lineNumbers': { minWidth: 'calc(3ch + 26px)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--line-selected)' },
  // Quiet solid tints the syntax colors are checked against: a selection's for a pair, a removed line's
  // for a bracket without one
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--line-selected)',
    outline: 'none',
  },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'var(--diff-remove)',
    outline: 'none',
  },
  // Solid tints, a quiet one under every match and a stronger one under the current match
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-current)' },
  '.cm-from-disk': { backgroundColor: 'var(--diff-add)' },
  '.cm-compare-added': { backgroundColor: 'var(--diff-add)' },
  '.cm-compare-removed': { backgroundColor: 'var(--diff-remove)' },
  '.cm-bracket-1, .cm-bracket-1 *': { color: 'var(--syntax-bracket1)' },
  '.cm-bracket-2, .cm-bracket-2 *': { color: 'var(--syntax-bracket2)' },
  '.cm-bracket-3, .cm-bracket-3 *': { color: 'var(--syntax-bracket3)' },
  '.cm-doc-tag, .cm-doc-tag *': { color: 'var(--syntax-control)' },
  // One 1px line at the start of each indent level, behind the text (editor-extras.ts sets --guides)
  '.cm-line.cm-guides': { position: 'relative' },
  '.cm-line.cm-guides::before': {
    content: '""',
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: '6px',
    width: 'calc(var(--guides) * var(--indent-columns) * 1ch)',
    backgroundImage: 'linear-gradient(to right, var(--syntax-indent-guide) 1px, transparent 1px)',
    backgroundSize: 'calc(var(--indent-columns) * 1ch) 100%',
    pointerEvents: 'none',
  },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
})
