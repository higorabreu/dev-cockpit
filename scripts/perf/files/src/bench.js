// Loaded into the cockpit's own page by measure.cjs (a dynamic import, as the file view will load the
// editor). It mounts each candidate over the tab, as the file view will sit, and times it from the page.
import { afterPaint } from './viewers.js'

const base = new URL('.', import.meta.url)
let asked = 0
let view
let current
const overlay = { element: undefined }
// Each pass of the Shiki plugin over the visible lines: the first one, then one per edit
const passes = []
// One highlighter per engine, language and theme for the page's life, as Shiki asks
const highlighters = {}

// The isolated-world bridge (preload.cjs) answers through window messages
function ask(kind, data = {}) {
  const id = ++asked
  return new Promise((resolve) => {
    const listen = (event) => {
      if (event.source !== window || event.data?.dckFilesReply !== id) return
      window.removeEventListener('message', listen)
      resolve(event.data)
    }
    window.addEventListener('message', listen)
    window.postMessage({ dckFilesAsk: { id, kind, ...data } }, '*')
  })
}

async function heap() {
  for (let i = 0; i < 3; i++) globalThis.gc?.()
  await new Promise((resolve) => setTimeout(resolve, 50))
  const { v8Used, blink } = await ask('heap')
  return { v8: v8Used / 1024, blink: blink / 1024 }
}

// Over the tab's area (#host), as the file view will be
function mount() {
  close()
  const host = document.getElementById('host').getBoundingClientRect()
  const element = document.createElement('div')
  element.id = 'dck-files-bench'
  element.style.cssText = `position:fixed;left:${host.left}px;top:${host.top}px;width:${host.width}px;height:${host.height}px;z-index:50;background:var(--bg);overflow:hidden`
  document.body.append(element)
  overlay.element = element
  return element
}

function close() {
  view?.destroy()
  view = undefined
  current?.dispose?.()
  current = undefined
  overlay.element?.remove()
  overlay.element = undefined
}

// scheme: through dck-file:, as the file view will load images and PDF; else straight from the file
function fileUrl(path, scheme = false) {
  return scheme ? `dck-file://open/${path.split('/').pop()}` : `file://${path}`
}

// The editor's code alone, as the first file opened loads it: what stays in memory with no file open
async function loadEditor() {
  const started = performance.now()
  await import('./editor.js')
  return performance.now() - started
}

async function openText({ path, syntax = 'none', theme = 'dark', blink = 'timer' }) {
  passes.length = 0
  const started = performance.now()
  const { content } = await ask('read', { path })
  const read = performance.now()
  const editor = await import('./editor.js')
  const imported = performance.now()
  const extensions = []
  const times = { read: read - started, import: imported - read }
  let fileColored
  if (syntax === 'lezer') {
    const lezer = await import('./lezer.js')
    const language = await lezer.lezerLanguage(path)
    extensions.push(language.support, lezer.lezerStyle(theme))
  } else if (syntax.startsWith('shiki')) {
    const shiki = await import('./shiki.js')
    const language = path.endsWith('.py') ? 'python' : 'typescript'
    const engine = syntax === 'shiki-oniguruma' ? 'oniguruma' : 'javascript'
    const loadedAt = performance.now()
    const key = `${engine} ${language} ${theme}`
    highlighters[key] ??= shiki.createShiki({ engine, language, theme })
    const highlighter = await highlighters[key]
    times.highlighter = performance.now() - loadedAt
    fileColored = new Promise((resolve) => {
      extensions.push(
        shiki.shikiColors(highlighter, (pass) => {
          if (pass.kind === 'file') resolve(pass)
          else passes.push(pass)
        }),
      )
    })
  }
  const languageReady = performance.now()
  times.language = languageReady - imported
  const parent = mount()
  view = editor.createEditor({ parent, doc: content, extensions, blink })
  const created = performance.now()
  times.view = created - languageReady
  const painted = await afterPaint()
  times.firstPaint = painted - started
  times.colored = colored(syntax) ? times.firstPaint : await coloredPaint(syntax, started)
  times.spans = view.contentDOM.querySelectorAll('.cm-line span').length
  if (passes.length > 0) times.firstPass = passes[0]
  if (fileColored) {
    const whole = await fileColored
    times.wholeFile = whole.ms
  }
  return times
}

const colored = (syntax) =>
  syntax !== 'none' && view.contentDOM.querySelector('.cm-line span[class]') !== null

// The end of the first frame that shows colored tokens on the visible lines, when the first one did not
async function coloredPaint(syntax, started) {
  if (syntax === 'none') return Number.NaN
  for (let i = 0; i < 200 && !colored(syntax); i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  return colored(syntax) ? (await afterPaint()) - started : Number.NaN
}

// Lezer: parse the whole text at once (what a jump to the end of the file needs at most)
async function parseAll() {
  const lezer = await import('./lezer.js')
  const started = performance.now()
  const tree = lezer.ensureSyntaxTree(view.state, view.state.doc.length, 60000)
  return { ms: performance.now() - started, complete: tree?.length === view.state.doc.length }
}

// How far the syntax tree reaches, against the text and the view
async function treeInfo() {
  const lezer = await import('./lezer.js')
  const tree = lezer.syntaxTree(view.state)
  return { tree: tree.length, doc: view.state.doc.length, viewportTo: view.viewport.to }
}

// ---------- key to echo ----------

const echo = { samples: [], pending: [], typed: '', prefix: '', observer: undefined }

// A new line in the middle of the file, holding the start of an assignment the typed letters complete
function startEcho({ prefix }) {
  const { state } = view
  const middle = state.doc.line(Math.floor(state.doc.lines / 2))
  const insert = `\n${prefix}`
  view.dispatch({
    changes: { from: middle.to, insert },
    selection: { anchor: middle.to + insert.length },
    scrollIntoView: true,
  })
  view.focus()
  echo.samples = []
  echo.pending = []
  echo.typed = ''
  echo.prefix = prefix
  window.addEventListener('keydown', onKey, true)
  echo.observer = new MutationObserver(onMutation)
  echo.observer.observe(view.contentDOM, { childList: true, subtree: true, characterData: true })
  return { line: middle.number + 1, of: view.state.doc.lines }
}

function onKey(event) {
  if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return
  echo.typed += event.key
  echo.pending.push({ text: echo.typed, key: event.timeStamp })
}

function onMutation() {
  if (echo.pending.length === 0) return
  let text
  for (const line of view.contentDOM.querySelectorAll('.cm-line')) {
    if (line.textContent.startsWith(echo.prefix)) {
      text = line.textContent.slice(echo.prefix.length)
      break
    }
  }
  if (text === undefined) return
  while (echo.pending.length > 0 && text.startsWith(echo.pending[0].text)) {
    const { key } = echo.pending.shift()
    const dom = performance.now()
    afterPaint().then((frame) => echo.samples.push({ dom: dom - key, frame: frame - key }))
  }
}

function stopEcho() {
  window.removeEventListener('keydown', onKey, true)
  echo.observer?.disconnect()
  return { samples: echo.samples, recolor: passes.filter((pass) => pass.kind === 'edit') }
}

// ---------- other kinds ----------

async function openImage({ path, cap, scheme }) {
  const started = performance.now()
  const viewers = await import('./viewers.js')
  const parent = mount()
  let result
  if (cap) {
    const { content } = await ask('read', { path, encoding: 'binary' })
    const type = path.endsWith('.png') ? 'image/png' : 'image/jpeg'
    result = await viewers.showImageCapped(parent, fileUrl(path), content, type, cap)
  } else {
    result = await viewers.showImage(parent, fileUrl(path, scheme))
  }
  return { ...result, firstPaint: performance.now() - started }
}

async function openMarkdown({ path, engine, lazy = false }) {
  const started = performance.now()
  const { content } = await ask('read', { path })
  const read = performance.now() - started
  const viewers = await import('./viewers.js')
  const result = await viewers.showMarkdown(mount(), content, engine, lazy)
  return { read, ...result, firstPaint: performance.now() - started }
}

async function openPdf({ path }) {
  const started = performance.now()
  const { content } = await ask('read', { path, encoding: 'binary' })
  const read = performance.now() - started
  const viewers = await import('./viewers.js')
  const result = await viewers.showPdf(mount(), content, new URL('pdf.worker.min.mjs', base).href)
  current = { scrollThrough: result.scrollThrough, dispose: result.destroy }
  return {
    read,
    load: result.load,
    open: result.open,
    firstPages: result.firstPages,
    pages: result.pages,
    firstPaint: performance.now() - started,
  }
}

// Chromium's own viewer over the tab (the window needs `plugins: true`), in an iframe or an embed
async function openPdfFrame({ path, scheme, element = 'iframe' }) {
  const started = performance.now()
  const frame = document.createElement(element)
  frame.style.cssText = 'width:100%;height:100%;border:0;display:block'
  if (element === 'embed') frame.type = 'application/pdf'
  frame.src = fileUrl(path, scheme)
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
  mount().append(frame)
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 5000))])
  return { load: performance.now() - started }
}

// ---------- file search ----------

let index
async function loadPaths({ path }) {
  const started = performance.now()
  const { content } = await ask('read', { path })
  const read = performance.now()
  const rank = await import('./rank.js')
  const paths = content.split('\n').filter(Boolean)
  const split = performance.now()
  index = rank.createIndex(paths)
  return {
    count: paths.length,
    read: read - started,
    split: split - read,
    index: performance.now() - split,
  }
}

// Each prefix of each query, as typed: the time to rank on one key. narrow: a key that extends the query
// ranks only the paths the shorter query matched, as a search box can
async function rankAll({ queries, narrow = false }) {
  const rank = await import('./rank.js')
  const times = []
  const firsts = []
  const top = {}
  for (const query of queries) {
    firsts.push(times.length)
    let within
    for (let length = 1; length <= query.length; length++) {
      const started = performance.now()
      const { best, matched } = rank.rank(
        index,
        query.slice(0, length),
        50,
        narrow ? within : undefined,
      )
      within = matched
      times.push(performance.now() - started)
      if (length === query.length) top[query] = best.slice(0, 3).map((entry) => entry.path)
    }
  }
  return { times, firsts, top }
}

function dropPaths() {
  index = undefined
}

// ---------- screenshots ----------

// VS Code's editor colors around Shiki's Dark+ and Light+ tokens: Dark Modern and Light Modern
const modern = {
  dark: { bg: '#1f1f1f', fg: '#cccccc', gutter: '#6e7681' },
  light: { bg: '#ffffff', fg: '#3b3b3b', gutter: '#6e7681' },
}

// The same file twice, side by side: Lezer with the VS Code palette on the cockpit's background, and Shiki
// with VS Code's own theme and editor colors as the reference
async function openPair({ path, theme }) {
  document.documentElement.dataset.theme = theme
  const { content } = await ask('read', { path })
  const editor = await import('./editor.js')
  const lezer = await import('./lezer.js')
  const shiki = await import('./shiki.js')
  const language = await lezer.lezerLanguage(path)
  const highlighter = await shiki.createShiki({
    engine: 'oniguruma',
    language: path.endsWith('.py') ? 'python' : 'typescript',
    theme,
  })
  const parent = mount()
  parent.style.display = 'flex'
  parent.style.gap = '1px'
  parent.style.background = 'var(--line)'
  const pane = (label, colors) => {
    const box = document.createElement('div')
    box.style.cssText = `flex:1;min-width:0;display:flex;flex-direction:column;background:${colors.bg}`
    const head = document.createElement('div')
    head.textContent = label
    head.style.cssText = `font:12px var(--font-sans);color:${colors.gutter};padding:8px 12px`
    const body = document.createElement('div')
    body.style.cssText = 'flex:1;min-height:0'
    box.append(head, body)
    parent.append(box)
    return body
  }
  const vscode = modern[theme]
  // Same font and size on both sides, and no scrollbar in the picture
  const shot = {
    '&': { fontSize: '13px' },
    '.cm-scroller': { overflow: 'hidden' },
  }
  const asVscode = editor.Prec.highest(
    editor.EditorView.theme({
      ...shot,
      '&': { ...shot['&'], backgroundColor: vscode.bg, color: vscode.fg },
      '.cm-gutters': { backgroundColor: vscode.bg, color: vscode.gutter },
    }),
  )
  const asPalette = editor.Prec.highest(
    editor.EditorView.theme({ ...shot, '&': { ...shot['&'], color: vscode.fg } }),
  )
  view = editor.createEditor({
    parent: pane('CodeMirror, Lezer grammar, VS Code palette', {
      bg: 'var(--bg)',
      gutter: 'var(--muted)',
    }),
    doc: content,
    extensions: [language.support, lezer.lezerStyle(theme), asPalette],
  })
  const right = editor.createEditor({
    parent: pane(`Shiki, TextMate grammar, ${theme === 'dark' ? 'Dark' : 'Light'} Modern`, vscode),
    doc: content,
    extensions: [shiki.shikiColors(highlighter), asVscode],
  })
  current = { dispose: () => right.destroy() }
  await new Promise((resolve) => setTimeout(resolve, 300))
  await afterPaint()
  const box = parent.getBoundingClientRect()
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

window.dckFilesBench = {
  heap,
  loadEditor,
  openPair,
  openText,
  parseAll,
  treeInfo,
  startEcho,
  stopEcho,
  openImage,
  openMarkdown,
  openPdf,
  openPdfFrame,
  scrollPdf: () => current?.scrollThrough?.(),
  loadPaths,
  rankAll,
  dropPaths,
  close,
  clearCache: () => ask('clearCache').then(() => true),
  scrollTo: (fraction) => {
    const line = view.state.doc.line(Math.max(1, Math.floor(view.state.doc.lines * fraction)))
    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
  },
}
