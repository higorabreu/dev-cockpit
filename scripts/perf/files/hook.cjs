// Loaded into the cockpit's main process through NODE_OPTIONS by measure.cjs, as ../inject.cjs is. It lets
// the driver run code in the cockpit's page (executeJavaScript, no DevTools session) and serves the page's
// file reads over IPC, the way the file view will get them from the host.
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')

const control = process.env.DCK_FILES_CONTROL
const fixtures = process.env.DCK_FILES_FIXTURES
// The daemon and the terminals inherit this environment: only this process loads the hook
delete process.env.NODE_OPTIONS
delete process.env.DCK_FILES_CONTROL
delete process.env.DCK_FILES_FIXTURES

// The file view's own scheme, registered as the files bridge registers it, serving the fixtures folder
// with the same headers, so images and PDF are also measured the way they will be loaded
const SCHEME = 'dck-file'
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' }

function serveFixtures(protocol) {
  protocol.handle(SCHEME, (request) => {
    const name = path.basename(new URL(request.url).pathname)
    const type = TYPES[path.extname(name)]
    if (!type) return new Response(null, { status: 404 })
    return new Response(fs.readFileSync(path.join(fixtures, name)), {
      headers: {
        'content-type': type,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    })
  })
}

function hook() {
  const { app, BrowserWindow, ipcMain, protocol, webContents } = require('electron')
  if (fixtures) {
    protocol.registerSchemesAsPrivileged([
      { scheme: SCHEME, privileges: { standard: true, secure: true, stream: true } },
    ])
    app.whenReady().then(() => serveFixtures(protocol))
  }
  const sessions = new Set()
  const preload = path.join(__dirname, 'preload.cjs')
  const extra = new Set()

  app.on('web-contents-created', (_event, contents) => {
    if (sessions.has(contents.session)) return
    sessions.add(contents.session)
    contents.session.registerPreloadScript({ type: 'frame', id: 'dck-files', filePath: preload })
  })

  ipcMain.handle('dck-files-read', (_event, file, encoding) =>
    encoding === 'binary' ? fs.readFileSync(file) : fs.readFileSync(file, 'utf8'),
  )

  const cockpit = () =>
    webContents.getAllWebContents().find((contents) => contents.getURL().endsWith('ui/index.html'))

  const handlers = {
    eval: async ({ code }) => cockpit().executeJavaScript(code, true),
    // A second window, for what the cockpit's own page cannot host (Chromium's PDF viewer)
    window: async ({ url, plugins }) => {
      const window = new BrowserWindow({
        width: 1200,
        height: 700,
        webPreferences: { contextIsolation: true, nodeIntegration: false, plugins },
      })
      extra.add(window)
      const started = Date.now()
      await window.loadURL(url)
      return { loaded: Date.now() - started, pid: window.webContents.getOSProcessId() }
    },
    closeWindows: async () => {
      for (const window of extra) window.destroy()
      extra.clear()
      return true
    },
    pid: async () => cockpit()?.getOSProcessId(),
    // The window's size in CSS pixels, for a screenshot that needs the room
    resize: async ({ width, height }) => {
      const window = BrowserWindow.fromWebContents(cockpit())
      window.setBounds({ x: 0, y: 0, width, height })
      return window.getBounds()
    },
    // Time until a white page covers a share of the area: the first page of a viewer whose frames the
    // page's own code cannot see (Chromium's PDF viewer runs in its own process)
    watchWhite: async ({ rect, share = 0.1, timeout = 10000 }) => {
      const started = Date.now()
      while (Date.now() - started < timeout) {
        const bitmap = (await cockpit().capturePage(rect)).toBitmap()
        let white = 0
        for (let i = 0; i < bitmap.length; i += 16) {
          if (bitmap[i] > 245 && bitmap[i + 1] > 245 && bitmap[i + 2] > 245) white++
        }
        if (white / (bitmap.length / 16) >= share) return Date.now() - started
        await new Promise((resolve) => setTimeout(resolve, 15))
      }
      return null
    },
    // A screenshot of part of the page, in device pixels, without DevTools
    capture: async ({ rect, file }) => {
      const image = await cockpit().capturePage(rect)
      fs.writeFileSync(file, image.toPNG())
      return image.getSize()
    },
  }

  const server = net.createServer((socket) => {
    let buffer = ''
    socket.on('data', (data) => {
      buffer += data
      let end = buffer.indexOf('\n')
      while (end >= 0) {
        const request = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        end = buffer.indexOf('\n')
        Promise.resolve()
          .then(() => handlers[request.kind](request))
          .then(
            (result) => socket.write(`${JSON.stringify({ id: request.id, result })}\n`),
            (error) =>
              socket.write(`${JSON.stringify({ id: request.id, error: String(error) })}\n`),
          )
      }
    })
    socket.on('error', () => socket.destroy())
  })
  fs.rmSync(control, { force: true })
  server.listen(control)
}

if (control && process.type === 'browser') setImmediate(hook)
