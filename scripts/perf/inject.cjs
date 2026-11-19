// Loaded into Electron's main process through NODE_OPTIONS by measure.cjs. It records the boot steps and
// every show and hide of the window, and loads probe.cjs into the page, all without a DevTools session
// (one would keep the page visible after hide() and skew the numbers). Events go to DCK_PERF_EVENTS as
// JSON lines, each with `at` in epoch milliseconds.
const fs = require('node:fs')
const path = require('node:path')

const file = process.env.DCK_PERF_EVENTS
// The daemon and the terminals inherit this environment: only this process loads the hooks
delete process.env.NODE_OPTIONS
delete process.env.DCK_PERF_EVENTS

const write = (kind, data = {}) =>
  fs.appendFileSync(file, `${JSON.stringify({ kind, at: Date.now(), ...data })}\n`)

function hook() {
  const { app, ipcMain } = require('electron')
  const sessions = new Set()
  const probe = path.join(__dirname, 'probe.cjs')

  if (app.isReady()) write('app-ready')
  else app.once('ready', () => write('app-ready'))

  app.on('web-contents-created', (_event, contents) => {
    const session = contents.session
    if (!sessions.has(session)) {
      sessions.add(session)
      // registerPreloadScript replaced setPreloads in Electron 35
      if (session.registerPreloadScript) {
        session.registerPreloadScript({ type: 'frame', id: 'dck-perf', filePath: probe })
      } else {
        session.setPreloads([...session.getPreloads(), probe])
      }
    }
    contents.once('dom-ready', () => write('dom-ready'))
    contents.once('did-finish-load', () => write('did-finish-load'))
  })

  app.on('browser-window-created', (_event, window) => {
    write('window-created')
    for (const method of ['show', 'showInactive', 'hide']) {
      const original = window[method].bind(window)
      window[method] = (...args) => {
        write(`${method}-call`)
        return original(...args)
      }
    }
  })

  ipcMain.on('dck-perf', (_event, data) => write(data.kind, data))
}

if (file && process.type === 'browser') {
  write('main-start')
  // The electron module only resolves once Electron has set up the main script, after NODE_OPTIONS ran
  setImmediate(hook)
}
