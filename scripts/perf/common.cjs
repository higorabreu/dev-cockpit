// Statistics, processes, memory and the X display, shared by measure.cjs and files/measure.cjs
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...parts) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...parts)

// ---------- statistics ----------

const median = (values) => quantile(values, 0.5)
function quantile(values, q) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return Number.NaN
  const index = (sorted.length - 1) * q
  const low = Math.floor(index)
  const high = Math.ceil(index)
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low)
}
const round = (value, digits = 1) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : Number.NaN

// ---------- processes ----------

const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    // The process exited between listing and reading
    return undefined
  }
}

function statOf(file) {
  const text = readText(file)
  if (!text) return undefined
  const close = text.lastIndexOf(')')
  const comm = text.slice(text.indexOf('(') + 1, close)
  const fields = text.slice(close + 2).split(' ')
  // Fields after the name start at the third one: ppid is the 4th, utime and stime the 14th and 15th
  return { comm, ppid: Number(fields[1]), ticks: Number(fields[11]) + Number(fields[12]) }
}

function allProcesses() {
  return fs
    .readdirSync('/proc')
    .filter((name) => /^\d+$/.test(name))
    .map((name) => ({ pid: Number(name), stat: statOf(`/proc/${name}/stat`) }))
    .filter((entry) => entry.stat)
}

// What belongs to this launch: the main process and its descendants, plus the detached daemon, which
// carries the launch's own socket in its environment
function processesOf(launch) {
  const table = allProcesses()
  const children = new Map()
  for (const { pid, stat } of table) {
    if (!children.has(stat.ppid)) children.set(stat.ppid, [])
    children.get(stat.ppid).push(pid)
  }
  const found = new Set()
  const walk = (pid) => {
    found.add(pid)
    for (const child of children.get(pid) ?? []) walk(child)
  }
  walk(launch.pid)
  for (const pid of launch.daemons) if (fs.existsSync(`/proc/${pid}`)) walk(pid)
  return [...found].map((pid) => ({ pid, kind: kindOf(pid, launch) })).filter((p) => p.kind)
}

function kindOf(pid, launch) {
  const cmdline = readText(`/proc/${pid}/cmdline`)
  if (cmdline === undefined) return undefined
  if (pid === launch.pid) return 'main'
  if (/daemon\.cjs(\0|$)/.test(cmdline)) return 'daemon'
  // Children forked from the zygote rewrite their title: one string with spaces, not NUL separated
  const type = /--type=([\w-]+)/.exec(cmdline)?.[1]
  if (type === 'renderer') return 'renderer'
  if (type === 'gpu-process') return 'gpu'
  if (type === 'zygote') return 'zygote'
  if (type || cmdline.includes('crashpad')) return 'utility'
  return 'terminal'
}

function findDaemons(endpoint) {
  const wanted = `DCK_ENDPOINT=${endpoint}`
  return allProcesses()
    .filter(({ pid }) => (readText(`/proc/${pid}/cmdline`) ?? '').includes('daemon.cjs'))
    .filter(({ pid }) => (readText(`/proc/${pid}/environ`) ?? '').split('\0').includes(wanted))
    .map(({ pid }) => pid)
}

function memoryOf(launch) {
  const byKind = {}
  let pss = 0
  let rss = 0
  let terminal = 0
  for (const { pid, kind } of processesOf(launch)) {
    const text = readText(`/proc/${pid}/smaps_rollup`) ?? ''
    const field = (name) => Number(new RegExp(`^${name}:\\s+(\\d+) kB`, 'm').exec(text)?.[1] ?? 0)
    const megabytes = field('Pss') / 1024
    if (kind === 'terminal') {
      terminal += megabytes
      continue
    }
    byKind[kind] = (byKind[kind] ?? 0) + megabytes
    pss += megabytes
    rss += field('Rss') / 1024
  }
  return { pss, rss, byKind, terminal, tabs: countShells(launch), visible: windowVisible(launch) }
}

function countShells(launch) {
  return processesOf(launch).filter(
    ({ pid, kind }) => kind === 'terminal' && statOf(`/proc/${pid}/stat`)?.comm === 'bash',
  ).length
}

// ---------- the display ----------

// Whether the cockpit has a window mapped on the display: a hidden sample taken with it still shown is void
const windowVisible = (launch) =>
  x(launch.display, 'search', '--onlyvisible', '--pid', launch.pid).status === 0

function x(display, ...args) {
  return spawnSync('xdotool', args.map(String), { env: { ...process.env, DISPLAY: display } })
}

async function ensureDisplay(display) {
  if (x(display, 'getdisplaygeometry').status === 0) return undefined
  log(`starting Xvfb on ${display}`)
  const server = spawn('Xvfb', [display, '-screen', '0', '1400x760x24', '-nolisten', 'tcp'], {
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    await sleep(100)
    if (x(display, 'getdisplaygeometry').status === 0) return server
  }
  throw new Error(`no X server answers on ${display}`)
}

module.exports = {
  allProcesses,
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
}
