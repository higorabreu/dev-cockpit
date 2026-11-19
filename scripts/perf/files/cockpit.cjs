// Launches a built cockpit, isolated as ../measure.cjs launches it, with hook.cjs in its main process, and
// talks to the hook: run code in the page, open a second window, quit.
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { findDaemons, processesOf, sleep } = require('../common.cjs')

const PROMPT = 'dck-f0$ '

function prepareHome(work) {
  fs.rmSync(work, { recursive: true, force: true })
  for (const dir of ['home', 'config', 'state', 'logs']) {
    fs.mkdirSync(path.join(work, dir), { recursive: true })
  }
  fs.mkdirSync(path.join(work, 'run'), { mode: 0o700 })
  fs.writeFileSync(path.join(work, 'home', '.bashrc'), `PS1='${PROMPT}'\nHISTFILE=/dev/null\n`)
}

function connect(file) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(file)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

async function launch({ build, electron, display, work, fixtures, extraArgs = [] }) {
  prepareHome(work)
  const control = path.join(work, 'run', 'files.sock')
  const endpoint = path.join(work, 'run', 'dck.sock')
  const env = {
    PATH: `${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    DISPLAY: display,
    HOME: path.join(work, 'home'),
    SHELL: '/bin/bash',
    TERM: 'xterm-256color',
    LANG: 'C.UTF-8',
    XDG_RUNTIME_DIR: path.join(work, 'run'),
    DCK_CONFIG_DIR: path.join(work, 'config'),
    DCK_STATE_DIR: path.join(work, 'state'),
    DCK_LOG_DIR: path.join(work, 'logs'),
    DCK_ENDPOINT: endpoint,
    DCK_NO_TRAY: '1',
    NODE_OPTIONS: `--require ${path.join(__dirname, 'hook.cjs')}`,
    DCK_FILES_CONTROL: control,
    ...(fixtures ? { DCK_FILES_FIXTURES: fixtures } : {}),
  }
  const spawnedAt = Date.now()
  const child = spawn(
    electron,
    [
      path.join(build, 'packages', 'shell'),
      '--no-sandbox',
      // gc() before each heap sample, and heap sizes not rounded
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
      ...extraArgs,
    ],
    {
      cwd: env.HOME,
      env,
      stdio: ['ignore', 'ignore', fs.openSync(path.join(work, 'logs', 'shell.log'), 'w')],
    },
  )
  const app = { pid: child.pid, child, display, endpoint, daemons: [], spawnedAt }
  for (let i = 0; i < 100 && !fs.existsSync(control); i++) await sleep(100)
  app.socket = await connect(control)
  app.replies = new Map()
  app.asked = 0
  let buffer = ''
  app.socket.on('data', (data) => {
    buffer += data
    let end = buffer.indexOf('\n')
    while (end >= 0) {
      const reply = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      end = buffer.indexOf('\n')
      app.replies.get(reply.id)?.(reply)
      app.replies.delete(reply.id)
    }
  })
  return app
}

function call(app, kind, data = {}, timeout = 120000) {
  const id = ++app.asked
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${kind} timed out`)), timeout)
    app.replies.set(id, (reply) => {
      clearTimeout(timer)
      if (reply.error) reject(new Error(reply.error))
      else resolve(reply.result)
    })
    app.socket.write(`${JSON.stringify({ id, kind, ...data })}\n`)
  })
}

// Runs an expression (or the body of an async function) in the page's own world
const evaluate = (app, code, timeout) => call(app, 'eval', { code }, timeout)

async function waitPrompt(app, timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const ready = await evaluate(
      app,
      `[...document.querySelectorAll('.xterm-rows')].some((rows) => rows.textContent.replace(/\\u00a0/g, ' ').includes(${JSON.stringify(PROMPT)}))`,
    ).catch(() => false)
    if (ready) {
      app.daemons = findDaemons(app.endpoint)
      return Date.now() - app.spawnedAt
    }
    await sleep(200)
  }
  throw new Error('no prompt')
}

async function quit(app) {
  app.socket?.destroy()
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
}

module.exports = { call, evaluate, launch, quit, waitPrompt }
