// Measures the cockpit's budgets (key to echo, hotkey to window, cold start, idle memory, idle CPU) and
// its build size, on one or more builds, on an X display of its own. See README.md beside this file.
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { parseArgs } = require('node:util')
const {
  ensureDisplay,
  findDaemons,
  median,
  memoryOf,
  processesOf,
  quantile,
  readText,
  round,
  sleep,
  statOf,
  windowVisible,
  x,
} = require('./common.cjs')

const here = __dirname
const repository = path.join(here, '..', '..')
const log = (...parts) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...parts)

// Read when the script runs, not when viewers.cjs borrows its helpers
const readOptions = () =>
  parseArgs({
    allowPositionals: true,
    options: {
      runs: { type: 'string', default: '3' },
      keys: { type: 'string', default: '60' },
      toggles: { type: 'string', default: '8' },
      'cold-wait': { type: 'string', default: '15' },
      'cpu-seconds': { type: 'string', default: '10' },
      phases: { type: 'string', default: 'probe,idle,tui,list,size' },
      display: { type: 'string', default: ':95' },
      electron: { type: 'string' },
      work: { type: 'string', default: path.join(os.tmpdir(), 'dck-perf') },
      out: { type: 'string' },
      tables: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })

const usage = `Usage: node scripts/perf/measure.cjs [options] [name=repository ...]

Each build is a built checkout (pnpm install && pnpm build); without one, this repository is measured.

  --runs N          launches per build and phase (default 3)
  --keys N          keys typed per run for key to echo (default 60)
  --toggles N       warm shows per run and path for hotkey to window (default 8)
  --cold-wait S     seconds hidden before a cold-ish show (default 15)
  --cpu-seconds S   CPU sampling window (default 10)
  --phases LIST     probe,idle,tui,list,size (default all)
  --display :N      X display; an Xvfb is started on it when none answers (default :95)
  --electron PATH   Electron binary (default: the first build's own)
  --work DIR        scratch folder, cleared per launch (default $TMPDIR/dck-perf)
  --out FILE        results JSON (default <work>/results.json)
  --tables FILE     print the tables of an earlier results JSON and exit
`

// ---------- processes ----------

const CLOCK_TICKS = Number(spawnSync('getconf', ['CLK_TCK']).stdout?.toString().trim()) || 100

function machineBusy() {
  const fields = readText('/proc/stat').split('\n')[0].trim().split(/\s+/).slice(1).map(Number)
  const idle = fields[3] + fields[4]
  return {
    busy: fields.reduce((sum, value) => sum + value, 0) - idle,
    total: fields.reduce((a, b) => a + b, 0),
  }
}

// Share of one core per process kind, and for the threads the rendering work runs on
const THREADS = { renderer: ['main', 'Compositor'], gpu: ['VizCompositorTh'] }
function snapshot(launch) {
  const processes = processesOf(launch).map(({ pid, kind }) => {
    const threads = {}
    for (const name of THREADS[kind] ?? []) threads[name] = 0
    for (const tid of fs.readdirSync(`/proc/${pid}/task`, { throwIfNoEntry: false }) ?? []) {
      const stat = statOf(`/proc/${pid}/task/${tid}/stat`)
      if (!stat) continue
      const name = Number(tid) === pid ? 'main' : stat.comm
      if (name in threads) threads[name] += stat.ticks
    }
    return { pid, kind, ticks: statOf(`/proc/${pid}/stat`)?.ticks ?? 0, threads }
  })
  return { at: Date.now(), processes, machine: machineBusy() }
}

async function cpuOf(launch, seconds) {
  const before = snapshot(launch)
  await sleep(seconds * 1000)
  const after = snapshot(launch)
  const elapsed = (after.at - before.at) / 1000
  const share = (ticks) => (ticks / CLOCK_TICKS / elapsed) * 100
  const byKind = {}
  const threads = {}
  let total = 0
  for (const process of after.processes) {
    const start = before.processes.find((p) => p.pid === process.pid)
    if (!start) continue
    const value = share(process.ticks - start.ticks)
    byKind[process.kind] = (byKind[process.kind] ?? 0) + value
    if (process.kind !== 'terminal') total += value
    for (const [name, ticks] of Object.entries(process.threads)) {
      const key = `${process.kind}.${name}`
      threads[key] = (threads[key] ?? 0) + share(ticks - (start.threads[name] ?? 0))
    }
  }
  const cores = os.cpus().length
  const machine =
    ((after.machine.busy - before.machine.busy) / (after.machine.total - before.machine.total)) *
    cores *
    100
  // Everything else running on the machine meanwhile, as cores: the noise of this sample
  return {
    byKind,
    threads,
    total,
    others: machine - total - (byKind.terminal ?? 0),
    visible: windowVisible(launch),
  }
}

// ---------- the app ----------

// The daemon's socket lives here: a Unix socket path holds at most 107 bytes
const runFolder = (work) => path.join(work, 'run')
const SOCKET_PATH_MAX = 107

function prepareHome(work, run) {
  fs.rmSync(work, { recursive: true, force: true })
  fs.rmSync(run, { recursive: true, force: true })
  for (const dir of ['home', 'config', 'state', 'logs'])
    fs.mkdirSync(path.join(work, dir), { recursive: true })
  fs.mkdirSync(run, { mode: 0o700 })
  fs.writeFileSync(
    path.join(work, 'home', '.bashrc'),
    [
      "PS1='dck-perf$ '",
      'HISTFILE=/dev/null',
      // The TUI workload replaces the shell of every tab opened with DCK_PERF_TUI
      'if [ -n "$DCK_PERF_TUI" ]; then exec node "$DCK_PERF_TUI"; fi',
      'if [ -n "$DCK_PERF_CD" ]; then cd "$DCK_PERF_CD"; fi',
      '',
    ].join('\n'),
  )
}

// A repository whose working tree changes every one of its LIST_FILES files, for the review's file list
const LIST_FILES = 1000
function makeRepository(folder) {
  const git = (...args) => {
    const done = spawnSync('git', args, {
      cwd: folder,
      env: { PATH: process.env.PATH, HOME: path.dirname(folder), GIT_CONFIG_NOSYSTEM: '1' },
    })
    if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`)
  }
  const files = Array.from({ length: LIST_FILES }, (_, i) =>
    path.join(
      'src',
      `module-${String(Math.floor(i / 100))}`,
      `file-${String(i).padStart(4, '0')}.ts`,
    ),
  )
  const body = (i, version) =>
    Array.from(
      { length: 12 },
      (_, line) => `export const value${line} = ${i * 100 + line + version}\n`,
    ).join('')
  for (const [i, file] of files.entries()) {
    fs.mkdirSync(path.join(folder, path.dirname(file)), { recursive: true })
    fs.writeFileSync(path.join(folder, file), body(i, 0))
  }
  git('init', '-q')
  git('add', '.')
  git('-c', 'user.name=perf', '-c', 'user.email=perf@example.com', 'commit', '-qm', 'start')
  for (const [i, file] of files.entries()) fs.writeFileSync(path.join(folder, file), body(i, 1))
}

async function launch(
  build,
  context,
  { probe = false, tui = false, repository = false, cd = undefined } = {},
) {
  const work = path.join(context.work, 'launch')
  const run = runFolder(context.work)
  prepareHome(work, run)
  const project = path.join(work, 'home', 'acme')
  if (repository) {
    fs.mkdirSync(project)
    makeRepository(project)
  }
  const endpoint = path.join(run, 'dck.sock')
  const events = path.join(work, 'events.jsonl')
  fs.writeFileSync(events, '')
  const env = {
    PATH: `${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    DISPLAY: context.display,
    HOME: path.join(work, 'home'),
    SHELL: '/bin/bash',
    TERM: 'xterm-256color',
    LANG: 'C.UTF-8',
    XDG_RUNTIME_DIR: run,
    DCK_CONFIG_DIR: path.join(work, 'config'),
    DCK_STATE_DIR: path.join(work, 'state'),
    DCK_LOG_DIR: path.join(work, 'logs'),
    DCK_ENDPOINT: endpoint,
    DCK_NO_TRAY: '1',
    ...(probe
      ? { NODE_OPTIONS: `--require ${path.join(here, 'inject.cjs')}`, DCK_PERF_EVENTS: events }
      : {}),
    ...(tui ? { DCK_PERF_TUI: path.join(here, 'tui.cjs') } : {}),
    ...(repository ? { DCK_PERF_CD: project } : {}),
    ...(cd ? { DCK_PERF_CD: cd } : {}),
  }
  const spawnedAt = Date.now()
  const child = spawn(
    context.electron,
    [path.join(build.path, 'packages', 'shell'), '--no-sandbox'],
    {
      cwd: env.HOME,
      env,
      stdio: ['ignore', 'ignore', fs.openSync(path.join(work, 'logs', 'shell.log'), 'w')],
    },
  )
  const app = {
    pid: child.pid,
    child,
    display: context.display,
    endpoint,
    events,
    spawnedAt,
    daemons: [],
    offset: 0,
    seen: [],
  }
  context.running.add(app)
  return app
}

async function quit(app, context) {
  app.daemons = [...new Set([...app.daemons, ...findDaemons(app.endpoint)])]
  const all = processesOf(app).map((p) => p.pid)
  for (const pid of [app.pid, ...app.daemons]) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already gone
    }
  }
  for (let i = 0; i < 50 && all.some((pid) => fs.existsSync(`/proc/${pid}`)); i++) await sleep(100)
  for (const pid of all) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone
    }
  }
  context.running.delete(app)
}

function readEvents(app) {
  const text = fs.readFileSync(app.events, 'utf8')
  const fresh = text.slice(app.offset)
  const end = fresh.lastIndexOf('\n') + 1
  app.offset += end
  for (const line of fresh.slice(0, end).split('\n')) if (line) app.seen.push(JSON.parse(line))
  return app.seen
}

async function waitEvent(app, kind, since, timeout = 5000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const found = readEvents(app).find((event) => event.kind === kind && event.at >= since)
    if (found) return found
    await sleep(5)
  }
  return undefined
}

function request(endpoint, method) {
  return new Promise((resolve) => {
    const socket = net.connect(endpoint)
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(undefined)
    }, 3000)
    socket.on('connect', () =>
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method })}\n`),
    )
    socket.on('data', (data) => {
      clearTimeout(timer)
      socket.end()
      resolve(String(data))
    })
    socket.on('error', () => {
      clearTimeout(timer)
      resolve(undefined)
    })
  })
}

async function waitFor(check, timeout, step = 100) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) return true
    await sleep(step)
  }
  return false
}

// The CLI as the GNOME shortcut of the packaged app runs it: Electron as Node on the bundled dck.mjs. A
// build that has the packaging's own buildCli (D30, after 0.12.0) splits what `toggle` does not load into
// `cli/` beside it; an older build is one file
async function bundleCli(build, context) {
  const outfile = path.join(context.work, `cli-${build.name}`, 'dck.mjs')
  const own = path.join(build.path, 'packages', 'shell', 'scripts', 'cli-bundle.mjs')
  if (fs.existsSync(own)) {
    await (await import(pathToFileURL(own).href)).buildCli(outfile)
    return outfile
  }
  const esbuild = require(path.join(build.path, 'packages', 'shell', 'node_modules', 'esbuild'))
  const jsonc = path.join(
    build.path,
    'packages/adapters/jsonc/node_modules/jsonc-parser/lib/esm/main.js',
  )
  esbuild.buildSync({
    entryPoints: [path.join(build.path, 'packages', 'cli', 'src', 'main.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
    alias: fs.existsSync(jsonc) ? { 'jsonc-parser': jsonc } : {},
    banner: {
      js: "import { createRequire as __dckRequire } from 'node:module'; const require = __dckRequire(import.meta.url);",
    },
  })
  return outfile
}

function toggleBy(way, app, context, build) {
  if (way === 'socket') return request(app.endpoint, 'window.toggle')
  return new Promise((resolve) => {
    const cli = spawn(context.electron, [build.cli, 'toggle'], {
      env: {
        PATH: process.env.PATH,
        HOME: os.tmpdir(),
        ELECTRON_RUN_AS_NODE: '1',
        DCK_PACKAGED: '1',
        DCK_ENDPOINT: app.endpoint,
      },
      stdio: 'ignore',
    })
    cli.on('exit', resolve)
  })
}

// ---------- phases ----------

async function probePhase(build, context) {
  const app = await launch(build, context, { probe: true })
  const result = { echo: [], show: { socket: [], cli: [], coldSocket: [], coldCli: [] }, missed: 0 }
  const prompt = await waitEvent(app, 'prompt', 0, 30000)
  if (!prompt) {
    log(`${build.name}: no prompt within 30 s`)
    await quit(app, context)
    return undefined
  }
  const at = (kind) => {
    const event = app.seen.find((e) => e.kind === kind)
    return event ? event.at - app.spawnedAt : Number.NaN
  }
  result.cold = {
    prompt: prompt.frame - app.spawnedAt,
    mainStart: at('main-start'),
    appReady: at('app-ready'),
    loaded: at('did-finish-load'),
    shown: at('show-call'),
  }
  await sleep(3000)

  // Letters only: the probe matches the prompt line against what was typed since the last Ctrl+U
  const letters = 'abcdefghijklmnopqrst'
  const keysFrom = Date.now()
  for (let i = 0; i < context.keys; i++) {
    if (i > 0 && i % letters.length === 0) {
      x(context.display, 'key', 'ctrl+u')
      await sleep(200)
    }
    x(context.display, 'key', letters[i % letters.length])
    await sleep(90 + Math.random() * 60)
  }
  x(context.display, 'key', 'ctrl+u')
  await sleep(500)
  readEvents(app)
  const echoes = app.seen.filter((e) => e.kind === 'echo' && e.at >= keysFrom)
  result.echo = echoes.map((e) => ({ dom: e.dom - e.key, frame: e.frame - e.key }))
  result.missed = context.keys - echoes.length

  const showOnce = async (way, hiddenFor) => {
    const hideAt = Date.now()
    await toggleBy(way, app, context, build)
    if (!(await waitEvent(app, 'hidden', hideAt, 3000))) return undefined
    await sleep(hiddenFor)
    const start = Date.now()
    await toggleBy(way, app, context, build)
    const visible = await waitEvent(app, 'visible', start, 3000)
    const call = app.seen.find((e) => e.kind === 'show-call' && e.at >= start)
    if (!visible) return undefined
    await sleep(700)
    return { painted: visible.frame - start, called: call ? call.at - start : Number.NaN }
  }
  for (const way of ['socket', 'cli']) {
    for (let i = 0; i < context.toggles; i++) {
      const sample = await showOnce(way, 800 + Math.random() * 400)
      if (sample) result.show[way].push(sample)
    }
  }
  for (const way of ['socket', 'cli']) {
    const sample = await showOnce(way, context.coldWait * 1000)
    if (sample) result.show[way === 'socket' ? 'coldSocket' : 'coldCli'].push(sample)
  }
  await quit(app, context)
  return result
}

async function settleShown(app, context, ms) {
  const visible = await waitFor(
    () => x(context.display, 'search', '--onlyvisible', '--pid', app.pid).status === 0,
    20000,
  )
  if (!visible) log('window never became visible')
  await sleep(ms)
  app.daemons = findDaemons(app.endpoint)
}

async function toggleAndSettle(app, ms) {
  await request(app.endpoint, 'window.toggle')
  await sleep(ms)
}

async function idlePhase(build, context) {
  const app = await launch(build, context)
  await settleShown(app, context, 8000)
  const result = {}
  result.memoryShown1 = memoryOf(app)
  result.cpuShown = await cpuOf(app, context.cpuSeconds)
  await toggleAndSettle(app, 3000)
  result.cpuHidden = await cpuOf(app, context.cpuSeconds)
  result.memoryHidden1 = memoryOf(app)
  await toggleAndSettle(app, 1500)
  for (let i = 0; i < 4; i++) {
    x(context.display, 'key', 'ctrl+shift+t')
    await sleep(1000)
  }
  await sleep(5000)
  result.memoryShown5 = memoryOf(app)
  await toggleAndSettle(app, 3000)
  result.memoryHidden5 = memoryOf(app)
  await quit(app, context)
  return result
}

async function tuiPhase(build, context) {
  const app = await launch(build, context, { tui: true })
  await settleShown(app, context, 8000)
  const result = {}
  result.cpuShown = await cpuOf(app, context.cpuSeconds)
  await toggleAndSettle(app, 3000)
  result.cpuHidden = await cpuOf(app, context.cpuSeconds)
  await quit(app, context)
  return result
}

// The review of a tab whose repository changed LIST_FILES files: the wheel scrolls its virtualized file
// list, then its diff, while the probe records the frames. Builds without the review report nothing
async function listPhase(build, context) {
  const app = await launch(build, context, { probe: true, repository: true })
  const result = {}
  try {
    if (!(await waitEvent(app, 'prompt', 0, 30000))) return undefined
    await sleep(2000)
    const opened = Date.now()
    x(context.display, 'key', 'ctrl+shift+d')
    const panes = await waitEvent(app, 'review', opened, 30000)
    if (!panes) return undefined
    result.rows = panes.files.rows
    await sleep(2000)
    for (const name of ['files', 'lines']) {
      const box = panes[name]
      if (!box) continue
      x(
        context.display,
        'mousemove',
        Math.round(box.x + box.width / 2),
        Math.round(box.y + box.height / 2),
      )
      await sleep(500)
      const from = Date.now()
      // About 2 s of wheel at 50 notches a second
      x(context.display, 'click', '--repeat', '100', '--delay', '20', '5')
      const scroll = await waitEvent(app, 'scroll', from, 10000)
      if (scroll) result[name] = scroll
      await sleep(500)
    }
    return result
  } finally {
    await quit(app, context)
  }
}

function sizeOf(target) {
  const stat = fs.statSync(target, { throwIfNoEntry: false })
  if (!stat) return 0
  if (!stat.isDirectory()) return stat.size
  return fs.readdirSync(target).reduce((sum, name) => sum + sizeOf(path.join(target, name)), 0)
}

// The UI's JavaScript every start parses: the entry and what it imports statically; the rest loads by
// import() on first use (the editor, its grammars, the Markdown and PDF viewers)
function startJavaScript(ui) {
  const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8')
  const seen = new Set()
  const walk = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const text = fs.readFileSync(path.join(ui, file), 'utf8')
    for (const [, name] of text.matchAll(
      /\bimport\s*(?:[\w${},\s*]+from\s*)?["']\.\/([^"']+\.js)["']/g,
    ))
      walk(path.join(path.dirname(file), name))
  }
  for (const [, file] of html.matchAll(/(?:src|href)="\.\/([^"]+\.js)"/g)) walk(file)
  return [...seen].reduce((sum, file) => sum + sizeOf(path.join(ui, file)), 0)
}

function sizePhase(build) {
  const shell = path.join(build.path, 'packages', 'shell', 'dist')
  const ui = path.join(shell, 'ui')
  const filesUnder = (dir, test) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { recursive: true })
          .filter((name) => test(String(name)))
          .reduce((sum, name) => sum + sizeOf(path.join(dir, String(name))), 0)
      : 0
  const kb = (bytes) => round(bytes / 1024, 0)
  return {
    total: kb(sizeOf(shell)),
    withoutMaps: kb(sizeOf(shell) - filesUnder(shell, (n) => n.endsWith('.map'))),
    mainJs: kb(sizeOf(path.join(shell, 'main.cjs'))),
    daemonJs: kb(sizeOf(path.join(shell, 'daemon.cjs'))),
    preloadJs: kb(sizeOf(path.join(shell, 'preload.cjs'))),
    uiJs: kb(filesUnder(ui, (n) => n.endsWith('.js'))),
    uiStartJs: kb(startJavaScript(ui)),
    uiCss: kb(filesUnder(ui, (n) => n.endsWith('.css'))),
    uiFonts: kb(filesUnder(ui, (n) => /\.(woff2?|ttf)$/.test(n))),
    ui: kb(sizeOf(ui)),
    nodeModules: kb(sizeOf(path.join(shell, 'node_modules'))),
    cliJs: kb(sizeOf(build.cli)),
  }
}

// ---------- tables ----------

function summarize(results) {
  const summary = {}
  for (const [name, build] of Object.entries(results.builds)) {
    const probes = build.probe.filter(Boolean)
    const pool = (pick) => probes.flatMap(pick)
    const perRun = (list, pick) => median(list.filter(Boolean).map(pick))
    const echo = pool((p) => p.echo.map((e) => e.frame))
    const show = (way, key = 'painted') => pool((p) => p.show[way].map((s) => s[key]))
    const idle = build.idle.filter(Boolean)
    const tui = build.tui.filter(Boolean)
    const lists = (build.list ?? []).filter(Boolean)
    const scroll = (pane) => ({
      fps: perRun(lists, (r) => r[pane]?.fps),
      p95: perRun(lists, (r) => r[pane]?.p95),
      late: perRun(lists, (r) => r[pane]?.late),
      moved: perRun(lists, (r) => r[pane]?.moved),
    })
    // A hidden sample taken while the window still showed (or the reverse) is left out
    const valid = (list, phase) =>
      list.filter((r) => r[phase] && r[phase].visible !== phase.includes('Hidden'))
    const cpu = (list, phase, key) =>
      perRun(
        valid(list, phase),
        (r) => (key.includes('.') ? r[phase].threads[key] : r[phase].byKind[key]) ?? 0,
      )
    const cpuSet = (list, phase) => ({
      renderer: cpu(list, phase, 'renderer'),
      rendererMain: cpu(list, phase, 'renderer.main'),
      compositor: cpu(list, phase, 'renderer.Compositor'),
      gpu: cpu(list, phase, 'gpu'),
      viz: cpu(list, phase, 'gpu.VizCompositorTh'),
      main: cpu(list, phase, 'main'),
      daemon: cpu(list, phase, 'daemon'),
      utility: cpu(list, phase, 'utility'),
      total: perRun(valid(list, phase), (r) => r[phase].total),
      others: perRun(valid(list, phase), (r) => r[phase].others),
      samples: valid(list, phase).length || Number.NaN,
    })
    const memory = (key) => ({
      pss: perRun(valid(idle, key), (r) => r[key].pss),
      rss: perRun(valid(idle, key), (r) => r[key].rss),
      renderer: perRun(valid(idle, key), (r) => r[key].byKind.renderer ?? 0),
      daemon: perRun(valid(idle, key), (r) => r[key].byKind.daemon ?? 0),
      tabs: perRun(valid(idle, key), (r) => r[key].tabs),
      samples: valid(idle, key).length || Number.NaN,
    })
    summary[name] = {
      runs: { probe: probes.length, idle: idle.length, tui: tui.length, list: lists.length },
      list: { rows: perRun(lists, (r) => r.rows), files: scroll('files'), lines: scroll('lines') },
      echo: {
        median: median(echo),
        p95: quantile(echo, 0.95),
        n: echo.length || Number.NaN,
        missed: probes.length > 0 ? pool((p) => [p.missed]).reduce((a, b) => a + b, 0) : Number.NaN,
      },
      echoDom: median(pool((p) => p.echo.map((e) => e.dom))),
      show: Object.fromEntries(
        ['socket', 'cli', 'coldSocket', 'coldCli'].map((way) => [
          way,
          {
            median: median(show(way)),
            p95: quantile(show(way), 0.95),
            n: show(way).length || Number.NaN,
            called: median(show(way, 'called')),
          },
        ]),
      ),
      cold: Object.fromEntries(
        ['prompt', 'mainStart', 'appReady', 'loaded', 'shown'].map((key) => [
          key,
          {
            median: perRun(probes, (p) => p.cold[key]),
            min: Math.min(...probes.map((p) => p.cold[key])),
            max: Math.max(...probes.map((p) => p.cold[key])),
          },
        ]),
      ),
      memory: {
        shown1: memory('memoryShown1'),
        hidden1: memory('memoryHidden1'),
        shown5: memory('memoryShown5'),
        hidden5: memory('memoryHidden5'),
      },
      cpu: {
        promptShown: cpuSet(idle, 'cpuShown'),
        promptHidden: cpuSet(idle, 'cpuHidden'),
        tuiShown: cpuSet(tui, 'cpuShown'),
        tuiHidden: cpuSet(tui, 'cpuHidden'),
      },
      size: build.size,
    }
  }
  return summary
}

function tables(results) {
  const summary = summarize(results)
  const names = Object.keys(summary)
  const fmt = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : 'n/a')
  const table = (title, budget, rows) => {
    // A phase that was not run leaves its table empty: leave it out
    if (!rows.some(([, pick]) => names.some((n) => Number.isFinite(pick(summary[n]))))) return ''
    const lines = [
      `### ${title}`,
      '',
      `| Metric | ${names.join(' | ')} | Budget |`,
      `| --- |${' --- |'.repeat(names.length)} --- |`,
    ]
    for (const [label, pick, digits, limit] of rows) {
      lines.push(
        `| ${label} | ${names.map((n) => fmt(pick(summary[n]), digits)).join(' | ')} | ${limit ?? budget} |`,
      )
    }
    return `${lines.join('\n')}\n`
  }
  const out = []
  out.push(
    table('Key to echo (ms, keydown to the frame that draws the character)', '16', [
      ['median', (s) => s.echo.median],
      ['p95', (s) => s.echo.p95],
      ['median to DOM change', (s) => s.echoDom, 1, ''],
      ['keys measured', (s) => s.echo.n, 0, ''],
      ['keys not echoed', (s) => s.echo.missed, 0, ''],
    ]),
  )
  out.push(
    table('Hotkey to visible window (ms, toggle request to the first frame drawn visible)', '100', [
      ['socket, warm, median', (s) => s.show.socket.median],
      ['socket, warm, p95', (s) => s.show.socket.p95],
      ['socket, request to show() in main', (s) => s.show.socket.called, 1, ''],
      ['CLI (GNOME shortcut path), warm, median', (s) => s.show.cli.median],
      ['CLI, warm, p95', (s) => s.show.cli.p95],
      ['socket, cold-ish, median', (s) => s.show.coldSocket.median],
      ['CLI, cold-ish, median', (s) => s.show.coldCli.median],
    ]),
  )
  out.push(
    table('Cold start (ms from spawning Electron, median of runs)', '2000', [
      ['first prompt drawn', (s) => s.cold.prompt.median, 0],
      ['first prompt, fastest run', (s) => s.cold.prompt.min, 0, ''],
      ['first prompt, slowest run', (s) => s.cold.prompt.max, 0, ''],
      ['main script starts', (s) => s.cold.mainStart.median, 0, ''],
      ['app ready', (s) => s.cold.appReady.median, 0, ''],
      ['page loaded', (s) => s.cold.loaded.median, 0, ''],
      ['show() called', (s) => s.cold.shown.median, 0, ''],
    ]),
  )
  out.push(
    table(
      'Idle memory (MB, PSS of every Electron process plus the daemon; terminals excluded)',
      '350',
      [
        ['1 tab, shown', (s) => s.memory.shown1.pss, 0],
        ['1 tab, hidden', (s) => s.memory.hidden1.pss, 0],
        ['5 tabs, shown', (s) => s.memory.shown5.pss, 0],
        ['5 tabs, hidden', (s) => s.memory.hidden5.pss, 0],
        ['1 tab, shown, RSS sum', (s) => s.memory.shown1.rss, 0, ''],
        ['5 tabs, shown, RSS sum', (s) => s.memory.shown5.rss, 0, ''],
        ['renderer PSS, 1 tab shown', (s) => s.memory.shown1.renderer, 0, ''],
        ['renderer PSS, 5 tabs shown', (s) => s.memory.shown5.renderer, 0, ''],
        ['daemon PSS, 1 tab shown', (s) => s.memory.shown1.daemon, 0, ''],
        ['tabs open in the 5 tab case', (s) => s.memory.shown5.tabs, 0, ''],
        ['runs counted, 1 tab hidden', (s) => s.memory.hidden1.samples, 0, ''],
        ['runs counted, 5 tabs hidden', (s) => s.memory.hidden5.samples, 0, ''],
      ],
    ),
  )
  for (const [key, label] of [
    ['promptShown', 'idle prompt, shown'],
    ['promptHidden', 'idle prompt, hidden'],
    ['tuiShown', 'TUI, shown'],
    ['tuiHidden', 'TUI, hidden'],
  ]) {
    out.push(
      table(`Idle CPU, ${label} (% of one core over the window, median of runs)`, '', [
        ['renderer', (s) => s.cpu[key].renderer],
        ['  renderer main thread', (s) => s.cpu[key].rendererMain],
        ['  renderer Compositor', (s) => s.cpu[key].compositor],
        ['GPU process', (s) => s.cpu[key].gpu],
        ['  VizCompositorThread', (s) => s.cpu[key].viz],
        ['main', (s) => s.cpu[key].main],
        ['daemon', (s) => s.cpu[key].daemon],
        ['other Electron processes', (s) => s.cpu[key].utility],
        ['total', (s) => s.cpu[key].total],
        ['rest of the machine (noise)', (s) => s.cpu[key].others],
        ['runs counted', (s) => s.cpu[key].samples, 0],
      ]),
    )
  }
  out.push(
    table(
      `Review of ${LIST_FILES} changed files, wheel scrolling (frames on the page's main thread, median of runs)`,
      '',
      [
        ['file list: frames per second', (s) => s.list.files.fps, 1, '60'],
        ['file list: p95 frame interval (ms)', (s) => s.list.files.p95, 1, '16.7'],
        ['file list: frames over 20 ms (%)', (s) => s.list.files.late, 1],
        ['file list: pixels scrolled', (s) => s.list.files.moved, 0],
        ['file list: rows in the DOM', (s) => s.list.rows, 0],
        ['diff: frames per second', (s) => s.list.lines.fps, 1, '60'],
        ['diff: p95 frame interval (ms)', (s) => s.list.lines.p95, 1, '16.7'],
        ['diff: frames over 20 ms (%)', (s) => s.list.lines.late, 1],
        ['diff: pixels scrolled', (s) => s.list.lines.moved, 0],
      ],
    ),
  )
  if (names.some((n) => summary[n].size)) {
    out.push(
      table('Build size (KB, packages/shell/dist)', '', [
        ['dist total', (s) => s.size?.total, 0],
        ['dist without source maps', (s) => s.size?.withoutMaps, 0],
        ['main.cjs', (s) => s.size?.mainJs, 0],
        ['daemon.cjs', (s) => s.size?.daemonJs, 0],
        ['preload.cjs', (s) => s.size?.preloadJs, 0],
        ['ui JavaScript', (s) => s.size?.uiJs, 0],
        ['ui JavaScript loaded at start', (s) => s.size?.uiStartJs, 0],
        ['ui CSS', (s) => s.size?.uiCss, 0],
        ['ui fonts', (s) => s.size?.uiFonts, 0],
        ['ui total', (s) => s.size?.ui, 0],
        ['node_modules (node-pty, unpruned)', (s) => s.size?.nodeModules, 0],
        ['dck CLI, what toggle loads (dck.mjs)', (s) => s.size?.cliJs, 0],
      ]),
    )
  }
  const runs = names.map(
    (n) =>
      `${n}: ${Object.entries(summary[n].runs)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}`,
  )
  out.push(`Runs that completed: ${runs.join('; ')}\n`)
  return out.filter(Boolean).join('\n')
}

// ---------- main ----------

async function main() {
  const { values: options, positionals } = readOptions()
  if (options.help) {
    process.stdout.write(usage)
    return
  }
  if (options.tables) {
    process.stdout.write(tables(JSON.parse(fs.readFileSync(options.tables, 'utf8'))))
    return
  }
  const builds = (positionals.length > 0 ? positionals : [`current=${repository}`]).map((entry) => {
    const [name, where] = entry.split('=')
    return { name, path: path.resolve(where) }
  })
  for (const build of builds) {
    if (!fs.existsSync(path.join(build.path, 'packages', 'shell', 'dist', 'main.cjs'))) {
      throw new Error(
        `${build.name}: no build in ${build.path} (run pnpm install && pnpm build there)`,
      )
    }
  }
  // Xvfb only when nothing answers on the display: a run on the desktop uses the desktop's own server
  const needed =
    x(options.display, 'getdisplaygeometry').status === 0 ? ['xdotool'] : ['Xvfb', 'xdotool']
  const missing = needed.filter(
    (tool) => spawnSync('sh', ['-c', `command -v ${tool}`]).status !== 0,
  )
  if (missing.length > 0) throw new Error(`missing tools: ${missing.join(', ')}`)

  const work = path.resolve(options.work)
  if (Buffer.byteLength(path.join(runFolder(work), 'dck.sock')) > SOCKET_PATH_MAX) {
    throw new Error(
      `the socket path under ${work} is too long for a Unix socket: pass a shorter --work`,
    )
  }
  fs.mkdirSync(work, { recursive: true })
  const context = {
    work,
    display: options.display,
    // Resolved here: Electron starts from the launch's own home, where a relative path means nothing
    electron: options.electron
      ? path.resolve(options.electron)
      : path.join(
          builds[0].path,
          'packages',
          'shell',
          'node_modules',
          'electron',
          'dist',
          'electron',
        ),
    keys: Number(options.keys),
    toggles: Number(options.toggles),
    coldWait: Number(options['cold-wait']),
    cpuSeconds: Number(options['cpu-seconds']),
    running: new Set(),
  }
  if (!fs.existsSync(context.electron))
    throw new Error(`no Electron at ${context.electron} (pass --electron)`)
  const phases = options.phases.split(',')
  const runs = Number(options.runs)
  const out = options.out ?? path.join(work, 'results.json')
  const server = await ensureDisplay(context.display)
  const stop = async () => {
    for (const app of [...context.running]) await quit(app, context)
    server?.kill()
  }
  process.on('SIGINT', () => void stop().then(() => process.exit(130)))

  const electronVersion = spawnSync(context.electron, ['-p', 'process.versions.electron'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
    .stdout.toString()
    .trim()
  const results = {
    date: new Date().toISOString(),
    machine: {
      cpus: os.cpus().length,
      model: os.cpus()[0]?.model,
      memoryGb: round(os.totalmem() / 2 ** 30),
      kernel: os.release(),
      loadAverage: os.loadavg(),
    },
    electron: electronVersion,
    options: {
      runs,
      keys: context.keys,
      toggles: context.toggles,
      coldWait: context.coldWait,
      cpuSeconds: context.cpuSeconds,
      display: context.display,
      phases,
    },
    builds: {},
  }
  for (const build of builds) {
    const wanted = JSON.parse(
      fs.readFileSync(path.join(build.path, 'packages', 'shell', 'package.json'), 'utf8'),
    ).devDependencies?.electron
    results.builds[build.name] = {
      path: build.path,
      electronWanted: wanted,
      probe: [],
      idle: [],
      tui: [],
      list: [],
    }
    if (phases.includes('probe') || phases.includes('size'))
      build.cli = await bundleCli(build, context)
    if (phases.includes('size')) results.builds[build.name].size = sizePhase(build)
  }
  const started = Date.now()
  // Runs go round the builds, so a busy minute on the machine does not land on one build only
  for (let run = 1; run <= runs; run++) {
    for (const build of builds) {
      const record = results.builds[build.name]
      for (const phase of ['probe', 'idle', 'tui', 'list'].filter((p) => phases.includes(p))) {
        log(`run ${run}/${runs} ${build.name} ${phase}`)
        const measure = {
          probe: probePhase,
          idle: idlePhase,
          tui: tuiPhase,
          list: listPhase,
        }[phase]
        try {
          record[phase].push(await measure(build, context))
        } catch (error) {
          log(`${build.name} ${phase} failed: ${error.stack ?? error}`)
          record[phase].push(undefined)
          for (const app of [...context.running]) await quit(app, context)
        }
        fs.writeFileSync(out, JSON.stringify(results, null, 2))
      }
    }
  }
  results.seconds = Math.round((Date.now() - started) / 1000)
  results.machine.loadAverageAfter = os.loadavg()
  fs.writeFileSync(out, JSON.stringify(results, null, 2))
  await stop()
  log(`done in ${results.seconds} s, results in ${out}`)
  process.stdout.write(tables(results))
}

module.exports = {
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
}

if (require.main === module)
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
