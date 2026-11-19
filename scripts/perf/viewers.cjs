// What each viewer of the file view costs (plans/files.md, F4b and F6): time from the key that opens a file
// to the end of the frame that shows it, and the memory (PSS of every process of the launch) the file adds
// while it shows and after another file replaces it; then key to echo in the editor. Fixtures from
// viewer-fixtures.py. See README.md beside this file.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { parseArgs } = require('node:util')
const {
  ensureDisplay,
  launch,
  log,
  median,
  memoryOf,
  processesOf,
  quantile,
  quit,
  readEvents,
  round,
  settleShown,
  sleep,
  waitEvent,
  x,
} = require('./measure.cjs')

const { values: options } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    keys: { type: 'string', default: '60' },
    fixtures: { type: 'string' },
    display: { type: 'string', default: ':95' },
    electron: { type: 'string' },
    work: { type: 'string', default: path.join(os.tmpdir(), 'dck-view') },
    out: { type: 'string' },
  },
})

// What the file search finds each fixture by, and what shows it
const ONLY = process.env.DCK_VIEWERS
const ALL_VIEWERS = [
  // The editor's code and the TypeScript grammar load with this one, as with the first file of a day
  {
    name: 'TypeScript 10 KB, first file of the launch',
    query: 'orders-10k',
    shows: 'editor',
    colors: true,
    first: true,
  },
  { name: 'TypeScript 10 KB', query: 'orders-10k', shows: 'editor', colors: true },
  { name: 'TypeScript 1 MB', query: 'orders-1mb', shows: 'editor', colors: true },
  { name: 'TypeScript 5 MB, no colors', query: 'orders-5mb', shows: 'editor' },
  { name: 'PNG 4000x3000', query: 'photo-4000', shows: 'image' },
  { name: 'JPEG 3600x2400 (2.4 MB)', query: 'photo.jpg', shows: 'image' },
  { name: 'SVG', query: 'logo.svg', shows: 'image' },
  { name: 'README 100 KB, preview', query: 'README.md', shows: 'editor', preview: true },
  { name: 'PDF 50 pages', query: 'manual.pdf', shows: 'pdf' },
]
// DCK_VIEWERS=PNG,JPEG measures only the viewers whose names start so
const VIEWERS = ONLY
  ? ALL_VIEWERS.filter((viewer) => ONLY.split(',').some((name) => viewer.name.startsWith(name)))
  : ALL_VIEWERS
// The editor's code loads with the first text, before any viewer, and closes each viewer after it
const SMALL_TEXT = 'guide.md'
// The file whose last line, `// dck-echo:`, takes the letters of key to echo
const ECHO_FILE = path.join('src', 'orders-10k.ts')
const LETTERS = 'abcdefghijklmnopqrst'

// Every 50 ms until stopped: the highest PSS of the launch
function peakOf(app) {
  let peak = 0
  const timer = setInterval(() => {
    peak = Math.max(peak, memoryOf(app).pss)
  }, 50)
  return () => {
    clearInterval(timer)
    return peak
  }
}

async function openFile(context, query) {
  x(context.display, 'key', 'ctrl+shift+o')
  await sleep(700)
  x(context.display, 'type', '--delay', '30', query)
  await sleep(700)
  const since = Date.now()
  x(context.display, 'key', 'Return')
  return since
}

// The first event of this viewer since the key: an SVG and a README show their editor on the way
async function waitShown(app, viewer, since, timeout = 15000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const found = readEvents(app).find(
      (event) => event.kind === 'viewer' && event.viewer === viewer && event.at >= since,
    )
    if (found) return found
    await sleep(5)
  }
  return undefined
}

// One viewer in a launch of its own, so what another file left behind never counts
async function viewerRun(build, context, viewer) {
  const app = await launch(build, context, { probe: true, cd: context.fixtures })
  if (!(await waitEvent(app, 'prompt', 0, 30000))) throw new Error('no prompt within 30 s')
  await settleShown(app, context, 3000)
  if (!viewer.first) await openFile(context, SMALL_TEXT)
  await sleep(4000)
  const before = memoryOf(app)
  const processes = processesOf(app).length
  const stop = peakOf(app)
  const since = await openFile(context, viewer.query)
  const shown = await waitShown(app, viewer.shows, since)
  let paint = shown ? shown.frame - shown.key : Number.NaN
  const colored = viewer.colors ? await waitShown(app, 'colors', since) : undefined
  if (viewer.preview) {
    await sleep(1500)
    const asked = Date.now()
    x(context.display, 'key', 'ctrl+shift+j')
    const preview = await waitShown(app, 'preview', asked)
    paint = preview ? preview.frame - preview.key : Number.NaN
  }
  await sleep(2500)
  const open = memoryOf(app)
  const processesOpen = processesOf(app).length
  const peak = stop()
  await openFile(context, SMALL_TEXT)
  await sleep(4000)
  const after = memoryOf(app)
  const processesAfter = processesOf(app).length
  await quit(app, context)
  log(`${viewer.name}: ${round(paint)} ms, +${round(open.pss - before.pss)} MB open`)
  return {
    name: viewer.name,
    paint,
    colors: colored ? colored.frame - colored.key : Number.NaN,
    open: open.pss - before.pss,
    peak: peak - before.pss,
    after: after.pss - before.pss,
    // Which process holds what is left
    afterByKind: Object.fromEntries(
      Object.entries(after.byKind).map(([kind, value]) => [
        kind,
        round(value - (before.byKind[kind] ?? 0)),
      ]),
    ),
    // Chromium's PDF viewer runs in processes of its own while it shows
    extraProcesses: processesOpen - processes,
    extraAfter: processesAfter - processes,
  }
}

// Letters typed into the 10 KB file at the end of its last line, 90 to 150 ms apart, as measure.cjs types
// at the prompt; from the keydown to the end of the frame that shows the letter
async function echoRun(build, context) {
  const file = path.join(context.fixtures, ECHO_FILE)
  const original = fs.readFileSync(file)
  const app = await launch(build, context, { probe: true, cd: context.fixtures })
  try {
    if (!(await waitEvent(app, 'prompt', 0, 30000))) throw new Error('no prompt within 30 s')
    await settleShown(app, context, 3000)
    const since = await openFile(context, 'orders-10k')
    if (!(await waitShown(app, 'colors', since))) throw new Error('the editor never showed colors')
    await sleep(1500)
    x(context.display, 'key', 'ctrl+End', 'Up', 'End')
    await sleep(500)
    const keysFrom = Date.now()
    for (let i = 0; i < context.keys; i++) {
      x(context.display, 'key', LETTERS[i % LETTERS.length])
      await sleep(90 + Math.random() * 60)
    }
    await sleep(500)
    const echoes = readEvents(app).filter((e) => e.kind === 'editor-echo' && e.at >= keysFrom)
    log(`editor echo: ${echoes.length} of ${context.keys} keys`)
    return {
      echo: echoes.map((e) => ({ dom: e.dom - e.key, frame: e.frame - e.key })),
      missed: context.keys - echoes.length,
    }
  } finally {
    await quit(app, context)
    // Auto save wrote the letters into the fixture
    fs.writeFileSync(file, original)
  }
}

const cell = (value) => (Number.isFinite(value) ? round(value, 0) : '')

function table(runs) {
  const rows = VIEWERS.map((viewer) => {
    const of = (key) =>
      median(
        runs.flatMap((run) => run.viewers.filter((r) => r.name === viewer.name).map((r) => r[key])),
      )
    return `| ${viewer.name} | ${cell(of('paint'))} | ${cell(of('colors'))} | ${round(of('open'))} | ${round(of('peak'))} | ${round(of('after'))} | ${of('extraProcesses')} / ${of('extraAfter')} |`
  })
  const lines = [
    '| Viewer | first paint (ms) | colors (ms) | PSS added, shown (MB) | peak while opening (MB) | after another file replaced it (MB) | processes added, shown / after |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Median of ${runs.length} runs.`,
  ]
  const echo = runs.flatMap((run) => run.echo?.echo ?? [])
  if (echo.length > 0) {
    const missed = runs.reduce((sum, run) => sum + (run.echo?.missed ?? 0), 0)
    const frame = echo.map((sample) => sample.frame)
    const dom = echo.map((sample) => sample.dom)
    lines.push(
      '',
      '| Key to echo in the editor (ms) | median | p95 |',
      '| --- | --- | --- |',
      `| to the end of the frame | ${round(median(frame))} | ${round(quantile(frame, 0.95))} |`,
      `| to the DOM change | ${round(median(dom))} | ${round(quantile(dom, 0.95))} |`,
      '',
      `${echo.length} keys over ${runs.length} runs, ${missed} not seen.`,
    )
  }
  return lines.join('\n')
}

async function main() {
  if (!options.fixtures) throw new Error('pass --fixtures <folder made by viewer-fixtures.py>')
  const build = { name: 'current', path: path.join(__dirname, '..', '..') }
  const work = path.resolve(options.work)
  fs.mkdirSync(work, { recursive: true })
  const context = {
    work,
    display: options.display,
    fixtures: path.resolve(options.fixtures),
    keys: Number(options.keys),
    // Resolved here: Electron starts from the launch's own home, where a relative path means nothing
    electron: options.electron
      ? path.resolve(options.electron)
      : path.join(build.path, 'packages', 'shell', 'node_modules', 'electron', 'dist', 'electron'),
    running: new Set(),
  }
  const server = await ensureDisplay(context.display)
  const runs = []
  for (let run = 1; run <= Number(options.runs); run++) {
    log(`run ${run}/${options.runs}`)
    const viewers = []
    for (const viewer of VIEWERS) {
      try {
        viewers.push(await viewerRun(build, context, viewer))
      } catch (error) {
        log(`run ${run} ${viewer.name} failed: ${error.stack ?? error}`)
        for (const app of [...context.running]) await quit(app, context)
      }
    }
    let echo
    if (context.keys > 0) {
      try {
        echo = await echoRun(build, context)
      } catch (error) {
        log(`run ${run} editor echo failed: ${error.stack ?? error}`)
      }
    }
    runs.push({ viewers, echo })
  }
  server?.kill()
  const out = options.out ?? path.join(work, 'viewers.json')
  fs.writeFileSync(out, JSON.stringify(runs, null, 2))
  process.stdout.write(`${table(runs)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
