// Measures the candidates of the file view (plans/files.md) inside a built cockpit's own page: the editor
// and its syntax colors, images, Markdown, PDF and the file search's ranking. See ../README.md.
const fs = require('node:fs')
const path = require('node:path')
const { parseArgs } = require('node:util')
const {
  ensureDisplay,
  median,
  memoryOf,
  processesOf,
  quantile,
  round,
  sleep,
  x,
} = require('../common.cjs')
const { call, evaluate, launch, quit, waitPrompt } = require('./cockpit.cjs')

const here = __dirname
const log = (...parts) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...parts)

const { values: options } = parseArgs({
  options: {
    build: { type: 'string', default: path.join(here, '..', '..', '..') },
    electron: { type: 'string' },
    display: { type: 'string', default: ':97' },
    work: { type: 'string', default: '/tmp/dck-f0/work' },
    fixtures: { type: 'string', default: '/tmp/dck-f0/fixtures' },
    runs: { type: 'string', default: '3' },
    keys: { type: 'string', default: '40' },
    phases: { type: 'string', default: 'text,syntax,blink,images,markdown,pdf,search' },
    lists: { type: 'string', default: '' },
    only: { type: 'string', default: '' },
    shots: { type: 'string', default: '/tmp/dck-f0/shots' },
    out: { type: 'string' },
    tables: { type: 'string' },
  },
})

const bench = `file://${path.join(here, 'dist', 'bench.js')}`
const fixture = (name) => path.join(options.fixtures, name)
const PREFIX = { ts: 'const dckProbe = ', py: 'dck_probe = ' }

// ---------- the build ----------

// The cockpit's CSP blocks WebAssembly, which Shiki's Oniguruma engine needs, and its window has no
// plugins, which Chromium's PDF viewer needs: both are opened in the built output only, and put back
function patchBuild({ plugins }) {
  const dist = path.join(options.build, 'packages', 'shell', 'dist')
  const files = {
    html: path.join(dist, 'ui', 'index.html'),
    main: path.join(dist, 'main.cjs'),
  }
  const saved = Object.fromEntries(
    Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, 'utf8')]),
  )
  // dck-file: as the file view will need it, for images and the PDF frame
  const html = saved.html
    .replace("default-src 'self';", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval';")
    .replace(
      "img-src 'self' data:",
      "img-src 'self' data: dck-file:; frame-src 'self' dck-file:; object-src 'self' dck-file:",
    )
  fs.writeFileSync(files.html, html)
  if (plugins) {
    fs.writeFileSync(
      files.main,
      saved.main.replace('contextIsolation: true,', 'contextIsolation: true, plugins: true,'),
    )
  }
  return () => {
    for (const [key, file] of Object.entries(files)) fs.writeFileSync(file, saved[key])
  }
}

// ---------- samples ----------

const heapOf = (app) =>
  evaluate(
    app,
    `(async () => {
      for (let i = 0; i < 3; i++) gc()
      await new Promise((resolve) => setTimeout(resolve, 50))
      return performance.memory.usedJSHeapSize / 1048576
    })()`,
  )

async function sample(app) {
  const heap = await heapOf(app)
  await sleep(300)
  const memory = memoryOf(app)
  const kinds = {}
  for (const { kind } of processesOf(app)) kinds[kind] = (kinds[kind] ?? 0) + 1
  return { heap, pss: memory.pss, byKind: memory.byKind, processes: kinds }
}

// executeJavaScript hides what the page threw: the error comes back as the result, and is thrown here
async function run(app, method, argument = {}) {
  const result = await evaluate(
    app,
    `Promise.resolve().then(() => window.dckFilesBench.${method}(${JSON.stringify(argument)})).catch((error) => ({ thrown: String(error?.stack ?? error) }))`,
    600000,
  )
  if (result?.thrown) throw new Error(`${method}: ${result.thrown}`)
  return result
}

async function session(extraArgs, body, { plugins = false } = {}) {
  const restore = patchBuild({ plugins })
  const app = await launch({
    build: options.build,
    electron: options.electron,
    display: options.display,
    work: options.work,
    fixtures: options.fixtures,
    extraArgs,
  })
  try {
    const prompt = await waitPrompt(app)
    // As the baseline's idle phase: the page settles before the first sample
    await sleep(6000)
    const idle = await sample(app)
    const started = Date.now()
    await evaluate(app, `import(${JSON.stringify(bench)}).then(() => true)`)
    const benchMs = Date.now() - started
    const loaded = await sample(app)
    return { prompt, idle, bench: { ms: benchMs, ...loaded }, ...(await body(app)) }
  } finally {
    await quit(app)
    restore()
  }
}

async function type(count) {
  const letters = 'abcdefghijklmnopqrst'
  for (let i = 0; i < count; i++) {
    x(options.display, 'key', letters[i % letters.length])
    await sleep(90 + Math.random() * 60)
  }
  await sleep(600)
}

async function echoIn(app, prefix) {
  const where = await run(app, 'startEcho', { prefix })
  await sleep(500)
  await type(Number(options.keys))
  const result = await run(app, 'stopEcho')
  return { where, ...result }
}

// ---------- scenarios ----------

async function text(app, { file, syntax = 'none', blink = 'timer', parse = false }) {
  const editorMs = await run(app, 'loadEditor')
  const editor = await sample(app)
  const open = await run(app, 'openText', { path: fixture(file), syntax, blink })
  await sleep(2000)
  const opened = await sample(app)
  const parsed = parse ? await run(app, 'parseAll') : undefined
  const afterParse = parse ? await sample(app) : undefined
  const echo = await echoIn(app, file.endsWith('.py') ? PREFIX.py : PREFIX.ts)
  // The same file again, with the code loaded and compiled: every open after the first one
  await run(app, 'close')
  await sleep(500)
  const warm = await run(app, 'openText', { path: fixture(file), syntax, blink })
  return { editor: { ms: editorMs, ...editor }, open, opened, parsed, afterParse, echo, warm }
}

// The highest PSS while the promise runs and a second after: a decode or a parse can peak far above
// what stays once it is done
async function withPeak(app, promise) {
  let peak = 0
  let done = false
  const settled = promise.finally(() => {
    done = true
  })
  while (!done) {
    peak = Math.max(peak, memoryOf(app).pss)
    await sleep(50)
  }
  for (let i = 0; i < 10; i++) {
    peak = Math.max(peak, memoryOf(app).pss)
    await sleep(100)
  }
  return { result: await settled, peak }
}

// What is left once the view closes and the page has had a few seconds
async function closed(app) {
  await run(app, 'close')
  await sleep(4000)
  const left = await sample(app)
  await run(app, 'clearCache')
  await sleep(2000)
  return { ...left, cleared: await sample(app) }
}

async function image(app, { file, cap }) {
  const { result: open, peak } = await withPeak(
    app,
    run(app, 'openImage', { path: fixture(file), cap }),
  )
  await sleep(2000)
  const opened = await sample(app)
  return { open, peak, opened, closed: await closed(app) }
}

async function markdown(app, { engine, lazy, file = 'readme.md' }) {
  const { result: open, peak } = await withPeak(
    app,
    run(app, 'openMarkdown', { path: fixture(file), engine, lazy }),
  )
  await sleep(2000)
  const opened = await sample(app)
  return { open, peak, opened, closed: await closed(app) }
}

async function pdfjs(app) {
  const { result: open, peak } = await withPeak(
    app,
    run(app, 'openPdf', { path: fixture('book.pdf') }),
  )
  await sleep(2000)
  const opened = await sample(app)
  const started = Date.now()
  const kept = await run(app, 'scrollPdf')
  const scrollMs = Date.now() - started
  await sleep(1000)
  const scrolled = await sample(app)
  return { open, peak, opened, scrollMs, kept, scrolled, closed: await closed(app) }
}

// Chromium's viewer draws in processes of its own: the first page is seen in the window's pixels
async function pdfChromium(app, { scheme, element } = {}) {
  const host = await evaluate(
    app,
    `(() => { const r = document.getElementById('host').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), screenX: window.screenX, screenY: window.screenY } })()`,
  )
  const rect = { x: host.x, y: host.y, width: host.width, height: host.height }
  const white = call(app, 'watchWhite', { rect, share: 0.15 })
  const { result: open, peak } = await withPeak(
    app,
    run(app, 'openPdfFrame', { path: fixture('book.pdf'), scheme, element }),
  )
  open.firstPage = await white
  await sleep(4000)
  const opened = await sample(app)
  // Down to the last page with the keyboard, in the viewer's own frame
  x(
    options.display,
    'mousemove',
    host.screenX + host.x + Math.round(host.width / 2),
    host.screenY + host.y + Math.round(host.height / 2),
  )
  x(options.display, 'click', '1')
  const started = Date.now()
  x(options.display, 'key', '--repeat', '70', '--delay', '50', 'Next')
  const scrollMs = Date.now() - started
  await sleep(3000)
  const scrolled = await sample(app)
  return { open, peak, opened, scrollMs, scrolled, closed: await closed(app) }
}

async function search(app, { list }) {
  const { result: load, peak } = await withPeak(app, run(app, 'loadPaths', { path: list }))
  await sleep(1000)
  const loaded = await sample(app)
  const queries = ['index', 'button.tsx', 'readme', 'src/main', 'pkgjson', 'utils/str']
  const ranked = await run(app, 'rankAll', { queries })
  const narrowed = await run(app, 'rankAll', { queries, narrow: true })
  await run(app, 'dropPaths')
  await sleep(2000)
  return { load, peak, loaded, ranked, narrowed, dropped: await sample(app) }
}

function scenarios() {
  const phases = new Set(options.phases.split(','))
  const list = []
  const add = (phase, name, body, extra = {}) => {
    if (phases.has(phase) && name.includes(options.only)) list.push({ phase, name, body, ...extra })
  }
  for (const file of ['small.ts', 'medium.ts', 'large.ts', 'medium.py']) {
    add('text', `plain ${file}`, (app) => text(app, { file }))
  }
  for (const file of ['medium.ts', 'medium.py']) {
    add('syntax', `lezer ${file}`, (app) => text(app, { file, syntax: 'lezer', parse: true }))
    for (const engine of ['oniguruma', 'javascript']) {
      add('syntax', `shiki-${engine} ${file}`, (app) =>
        text(app, { file, syntax: `shiki-${engine}` }),
      )
    }
  }
  add('syntax', 'lezer large.ts', (app) => text(app, { file: 'large.ts', syntax: 'lezer' }))
  for (const blink of ['css', 'off']) {
    add('blink', `lezer medium.ts, blink ${blink}`, (app) =>
      text(app, { file: 'medium.ts', syntax: 'lezer', blink }),
    )
  }
  for (const file of ['photo.png', 'photo.jpg']) {
    add('images', `img ${file}`, (app) => image(app, { file }))
    add('images', `bitmap 2048 ${file}`, (app) => image(app, { file, cap: 2048 }))
  }
  for (const engine of ['markdown-it', 'marked']) {
    add('markdown', `${engine} readme.md`, (app) => markdown(app, { engine }))
    add('markdown', `${engine} readme.md, content-visibility`, (app) =>
      markdown(app, { engine, lazy: true }),
    )
    add('markdown', `${engine} readme-100k.md`, (app) =>
      markdown(app, { engine, file: 'readme-100k.md' }),
    )
  }
  add('pdf', 'pdf.js book.pdf', pdfjs)
  add('pdf', 'chromium book.pdf', pdfChromium, { plugins: true })
  // Through dck-file:, registered and served as the files bridge does
  add('protocol', 'img photo.jpg, dck-file', (app) =>
    image(app, { file: 'photo.jpg', scheme: true }),
  )
  add('protocol', 'chromium book.pdf, dck-file', (app) => pdfChromium(app, { scheme: true }), {
    plugins: true,
  })
  add(
    'protocol',
    'chromium book.pdf, dck-file, embed',
    (app) => pdfChromium(app, { scheme: true, element: 'embed' }),
    { plugins: true },
  )
  for (const list_ of options.lists.split(',').filter(Boolean)) {
    add('search', `rank ${path.basename(list_)}`, (app) => search(app, { list: list_ }))
  }
  return list
}

// ---------- screenshots ----------

async function shots() {
  fs.mkdirSync(options.shots, { recursive: true })
  await session(['--force-device-scale-factor=2'], async (app) => {
    await call(app, 'resize', { width: 1400, height: 720 })
    await sleep(1000)
    for (const file of ['snippet.ts', 'snippet.py']) {
      for (const theme of ['dark', 'light']) {
        const box = await run(app, 'openPair', { path: fixture(file), theme })
        const name = `${file.replace('.', '-')}-${theme}.png`
        const rect = {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.min(Math.round(box.height), 600),
        }
        const size = await call(app, 'capture', { rect, file: path.join(options.shots, name) })
        log(`${name}: ${size.width}x${size.height}`)
        await run(app, 'close')
      }
    }
    return {}
  })
}

// ---------- tables ----------

function summarize(results) {
  const rows = []
  for (const [name, runs] of Object.entries(results)) {
    const ok = runs.filter((entry) => entry && !entry.error)
    const per = (pick) => round(median(ok.map(pick)), 1)
    const delta = (to, from, key) => per((r) => (r[to]?.[key] ?? NaN) - (r[from]?.[key] ?? NaN))
    const echoes = ok.flatMap((r) => r.echo?.samples ?? [])
    const recolor = ok.flatMap((r) => r.echo?.recolor ?? [])
    const row = {
      name,
      runs: ok.length,
      idlePss: per((r) => r.idle.pss),
      idleRenderer: per((r) => r.idle.byKind.renderer),
      benchPss: delta('bench', 'idle', 'pss'),
    }
    if (ok[0]?.editor) {
      Object.assign(row, {
        editorImportMs: per((r) => r.editor.ms),
        editorPss: delta('editor', 'bench', 'pss'),
        editorHeap: delta('editor', 'bench', 'heap'),
        filePss: delta('opened', 'editor', 'pss'),
        fileHeap: delta('opened', 'editor', 'heap'),
        readMs: per((r) => r.open.read),
        firstPaintMs: per((r) => r.open.firstPaint),
        coloredMs: per((r) => r.open.colored),
        warmPaintMs: per((r) => r.warm?.firstPaint),
        warmColoredMs: per((r) => r.warm?.colored),
        highlighterMs: per((r) => r.open.highlighter),
        wholeFileMs: per((r) => r.open.wholeFile),
        parseAllMs: per((r) => r.parsed?.ms),
        parseAllHeap: delta('afterParse', 'opened', 'heap'),
        echoMedian: round(median(echoes.map((e) => e.frame)), 1),
        echoP95: round(
          quantile(
            echoes.map((e) => e.frame),
            0.95,
          ),
          1,
        ),
        echoDom: round(median(echoes.map((e) => e.dom)), 1),
        echoes: echoes.length,
        recolorLines: round(median(recolor.map((p) => p.lines)), 0),
        recolorMs: round(median(recolor.map((p) => p.ms)), 2),
        recolorP95: round(
          quantile(
            recolor.map((p) => p.ms),
            0.95,
          ),
          2,
        ),
      })
    } else if (ok[0]?.load) {
      const times = (key) => ok.flatMap((r) => r[key].times)
      Object.assign(row, {
        count: per((r) => r.load.count),
        readMs: per((r) => r.load.read),
        indexMs: per((r) => r.load.split + r.load.index),
        listHeap: delta('loaded', 'bench', 'heap'),
        listPss: delta('loaded', 'bench', 'pss'),
        peakPss: per((r) => r.peak - r.bench.pss),
        droppedPss: delta('dropped', 'bench', 'pss'),
        rankMedian: round(median(times('ranked')), 1),
        rankP95: round(quantile(times('ranked'), 0.95), 1),
        rankMax: round(Math.max(...times('ranked')), 1),
        narrowMedian: round(median(times('narrowed')), 1),
        narrowP95: round(quantile(times('narrowed'), 0.95), 1),
        narrowMax: round(Math.max(...times('narrowed')), 1),
        firstKeyMedian: round(
          median(ok.flatMap((r) => r.ranked.times.filter((_, i) => r.ranked.firsts?.includes(i)))),
          1,
        ),
        top: ok[0].ranked.top,
      })
    } else {
      const open = (key) => per((r) => r.open[key])
      Object.assign(row, {
        firstPaintMs: per((r) => r.open.firstPage ?? r.open.firstPaint ?? r.open.load),
        open: Object.fromEntries(
          Object.keys(ok[0]?.open ?? {})
            .filter((key) => typeof ok[0].open[key] === 'number')
            .map((key) => [key, open(key)]),
        ),
        pss: delta('opened', 'bench', 'pss'),
        peak: per((r) => r.peak - r.bench.pss),
        renderer: per((r) => r.opened.byKind.renderer - r.bench.byKind.renderer),
        gpu: per((r) => (r.opened.byKind.gpu ?? 0) - (r.bench.byKind.gpu ?? 0)),
        heap: delta('opened', 'bench', 'heap'),
        closedPss: delta('closed', 'bench', 'pss'),
        clearedPss: per((r) => r.closed.cleared.pss - r.bench.pss),
        processes: ok[0]?.opened.processes,
        idleProcesses: ok[0]?.idle.processes,
        scrolledPss: ok[0]?.scrolled ? delta('scrolled', 'bench', 'pss') : undefined,
        scrollMs: ok[0]?.scrollMs ? per((r) => r.scrollMs) : undefined,
      })
    }
    rows.push(row)
  }
  return rows
}

// ---------- main ----------

async function main() {
  if (options.tables) {
    for (const row of summarize(JSON.parse(fs.readFileSync(options.tables, 'utf8')))) {
      console.log(JSON.stringify(row))
    }
    return
  }
  options.electron ??= path.join(
    options.build,
    'packages',
    'shell',
    'node_modules',
    'electron',
    'dist',
    'electron',
  )
  const server = await ensureDisplay(options.display)
  const out = options.out ?? path.join(path.dirname(options.work), 'files-results.json')
  const results = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {}
  try {
    if (options.phases.split(',').includes('shots')) await shots()
    const list = scenarios()
    // Runs go round the scenarios, so a busy minute on a shared machine does not land on one of them
    for (let round_ = 0; round_ < Number(options.runs); round_++) {
      for (const scenario of list) {
        log(`run ${round_ + 1}: ${scenario.name}`)
        if (round_ === 0) results[scenario.name] = []
        const result = await session([], scenario.body, { plugins: scenario.plugins }).catch(
          (error) => ({ error: String(error) }),
        )
        if (result.error) log(`  ${result.error}`)
        results[scenario.name].push(result)
        fs.writeFileSync(out, JSON.stringify(results, null, 1))
      }
    }
  } finally {
    server?.kill()
  }
  for (const row of summarize(results)) console.log(JSON.stringify(row))
  log(`results in ${out}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
