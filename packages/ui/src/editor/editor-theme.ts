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
  // Solid: the gutter stays put while a long line scrolls sideways, and the text passes under it
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
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
  // VS Code's hues, as strong as the comments' contrast allows: orange under every match, gold under the
  // current one, which a 1px outline in the warning color tells by shape, since its tint cannot be brighter
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)' },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--search-current)',
    boxShadow: 'inset 0 0 0 var(--size-hairline) var(--warning)',
  },
  // The lines with matches, beside the scrollbar (editor-search.ts); the current one in the foreground
  '.cm-search-marks': {
    position: 'absolute',
    right: '0',
    width: 'var(--size-scrollbar)',
    pointerEvents: 'none',
    zIndex: '2',
  },
  '.cm-search-mark': {
    position: 'absolute',
    left: '1px',
    right: '1px',
    height: '2px',
    backgroundColor: 'var(--warning)',
  },
  '.cm-search-mark.current': { height: '3px', backgroundColor: 'var(--fg)' },
  '.cm-from-disk': { backgroundColor: 'var(--diff-add)' },
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
  // The find widget and Go to line hang from the header's border at the top right, over the code, left of
  // the scrollbar and its marks (styles/editor.css draws them). CodeMirror still reads their height as a
  // scroll margin, so a match it scrolls to never lands under them
  '.cm-panels': { backgroundColor: 'transparent', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': {
    position: 'absolute',
    top: '0',
    left: 'auto',
    right: 'calc(var(--size-scrollbar) + 8px)',
    maxWidth: 'calc(100% - var(--size-scrollbar) - 16px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    border: 'none',
    // The drawer slides out from under the header's edge, never over it
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  '.cm-panels-top > .cm-panel': { pointerEvents: 'auto' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
})
