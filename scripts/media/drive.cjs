// Drives the built app for one README clip and records the screen. Started by run.sh, which sets up the
// display, the session bus, the fake services and these variables: MEDIA_WORK, DCK_REPO, ELECTRON, SCREEN,
// SCENE and MODE (dry takes screenshots, record captures the screen with ffmpeg).
const { _electron } = require('playwright')
const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const work = process.env.MEDIA_WORK
const repo = process.env.DCK_REPO
const scene = process.env.SCENE
const mode = process.env.MODE
const home = process.env.MEDIA_HOME
const run = path.join(home, '.run')
const [W, H] = (process.env.SCREEN ?? '1280x720').split('x').map(Number)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const events = []
let t0 = Date.now()
const mark = (name) => {
  const t = (Date.now() - t0) / 1000
  events.push([name, t])
  console.log('EVENT', name, t.toFixed(2))
}
const dckEnv = { ...process.env, DCK_ENDPOINT: path.join(run, 'dck.sock') }
const toggle = () => execFileSync(path.join(work, 'bin', 'dck'), ['toggle'], { env: dckEnv })
const xdotool = (...args) => execFileSync('xdotool', args.map(String))
// What Claude Code needs to reach its API travels to its wrapper under other names, so the cockpit
// itself never sees them; nothing is written to disk
const passed = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CONFIG_DIR',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
]

async function main() {
  const scenes = require('./scenes.cjs')
  const current = scenes[scene]
  const base = {
    language: 'en',
    theme: 'dark',
    fontSize: 15,
    window: { heightRatio: 0.7, restoreTabs: false },
    projects: { root: path.join(home, 'projects'), depth: 1 },
    system: { agentConnectHint: false, notifyAfterSeconds: 600 },
  }
  const settings = { ...base, ...(current.settings ?? {}) }
  fs.writeFileSync(
    path.join(work, 'state', 'cfg', 'settings.json'),
    JSON.stringify(settings, null, 2),
  )

  const app = await _electron.launch({
    executablePath: process.env.ELECTRON,
    args: [path.join(repo, 'packages', 'shell'), '--no-sandbox'],
    cwd: home,
    env: {
      PATH: `${path.join(work, 'bin')}:${process.env.PATH}`,
      DISPLAY: process.env.DISPLAY,
      DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
      HOME: home,
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      MEDIA_BIN: path.join(work, 'bin'),
      MEDIA_WORK: work,
      XDG_RUNTIME_DIR: run,
      DCK_CONFIG_DIR: path.join(work, 'state', 'cfg'),
      DCK_STATE_DIR: path.join(work, 'state', 'state'),
      DCK_NO_TRAY: '1',
      DCK_ENDPOINT: path.join(run, 'dck.sock'),
      FAKE_KEYRING: path.join(work, 'state', 'keyring'),
      ...Object.fromEntries(
        passed
          .filter((name) => process.env[name])
          .map((name) => [`MEDIA_PASS_${name}`, process.env[name]]),
      ),
    },
  })
  app.process().stderr.on('data', (data) => process.stdout.write(`main ${data}`))
  const page = await app.firstWindow()
  page.on('pageerror', (error) => console.log('pageerror', String(error)))
  await sleep(2500)

  let shots = 0
  const shot = async (name) => {
    if (mode !== 'dry' && !process.env.SHOTS) return
    shots += 1
    const file = path.join(work, 'shots', `${scene}-${String(shots).padStart(2, '0')}-${name}.png`)
    execFileSync('import', ['-window', 'root', file])
  }
  const type = async (text, delay = 45) => {
    for (const ch of text) {
      await page.keyboard.type(ch)
      await sleep(delay + Math.random() * delay * 0.6)
    }
  }
  const screenText = () =>
    page.evaluate(() =>
      (document.querySelector('.tabview.active .xterm-rows')?.textContent ?? '').replace(/ /g, ' '),
    )
  const waitFor = async (check, timeout, label) => {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      if (await check()) return true
      await sleep(250)
    }
    console.log('TIMEOUT', label)
    return false
  }
  // The terminal stayed the same for a while: the agent finished or waits
  const quiet = async (ms, timeout) => {
    let last = ''
    let since = Date.now()
    const end = Date.now() + timeout
    while (Date.now() < end) {
      const now = await screenText()
      if (now !== last) {
        last = now
        since = Date.now()
      } else if (Date.now() - since > ms) return true
      await sleep(250)
    }
    return false
  }
  const visible = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())
  const show = async () => {
    for (let i = 0; i < 2 && !(await visible()); i++) {
      toggle()
      await sleep(1200)
    }
  }
  const hide = async () => {
    if (await visible()) toggle()
    await sleep(1200)
  }
  // The real pointer, so the recording shows it and the app gets real hover and clicks
  let pointer = { x: W - 1, y: H - 1 }
  const glide = async (x, y, ms = 450) => {
    const steps = Math.max(1, Math.round(ms / 16))
    const from = pointer
    for (let i = 1; i <= steps; i++) {
      const k = i / steps
      const e = k * k * (3 - 2 * k)
      xdotool(
        'mousemove',
        Math.round(from.x + (x - from.x) * e),
        Math.round(from.y + (y - from.y) * e),
      )
      await sleep(16)
    }
    pointer = { x, y }
  }
  const click = async (x, y, ms) => {
    await glide(x, y, ms)
    await sleep(120)
    xdotool('click', 1)
  }
  const drag = async (from, to, ms = 700) => {
    await glide(from.x, from.y)
    await sleep(150)
    xdotool('mousedown', 1)
    await sleep(100)
    await glide(to.x, to.y, ms)
    await sleep(100)
    xdotool('mouseup', 1)
  }
  const park = () => glide(W - 1, H - 1, 300)
  const centerOf = async (locator) => {
    const box = await locator.first().boundingBox()
    if (!box) throw new Error(`invariant: nothing to point at for ${locator}`)
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  }
  const search = async (text, delay) => {
    await page.keyboard.press('Control+Shift+P')
    await sleep(700)
    await type(text, delay)
    await sleep(600)
    await page.keyboard.press('Enter')
    await sleep(1500)
  }
  const panel = async (open) => {
    const isOpen = await page.evaluate(
      () => (document.querySelector('#panel')?.getBoundingClientRect().width ?? 0) > 100,
    )
    if (isOpen !== open) await page.keyboard.press('Control+Shift+B')
    await sleep(800)
  }
  const clickNotification = () =>
    execFileSync('gdbus', [
      'call',
      '--session',
      '--dest',
      'org.freedesktop.Notifications',
      '--object-path',
      '/org/freedesktop/Notifications',
      '--method',
      'org.example.MediaNotifications.Click',
    ])
  // Whether a window with this title is mapped on the display
  const windowShown = async (title) => {
    const tree = execFileSync('xwininfo', ['-root', '-tree']).toString()
    return tree.split('\n').some((line) => line.includes(`"${title}"`) && !/\b1x1\+/.test(line))
  }
  // The page the fake xdg-open showed goes away, as a closed browser window would
  const closeBrowser = () => spawn('pkill', ['-f', path.join(work, 'pages')]).on('error', () => {})

  let ffmpeg
  const record = async () => {
    if (mode !== 'record') return
    const args = [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'x11grab',
      '-draw_mouse',
      '1',
      '-framerate',
      '30',
    ]
    args.push(
      '-video_size',
      `${W}x${H}`,
      '-i',
      process.env.DISPLAY,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
    )
    args.push('-crf', '10', '-pix_fmt', 'yuv444p', path.join(work, 'raw', `${scene}.mp4`))
    ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] })
    await sleep(1000)
  }

  xdotool('mousemove', pointer.x, pointer.y)
  const c = {
    app,
    page,
    W,
    H,
    sleep,
    shot,
    type,
    screenText,
    waitFor,
    quiet,
    show,
    hide,
    toggle,
    glide,
    click,
    drag,
    park,
    centerOf,
    search,
    panel,
    clickNotification,
    closeBrowser,
    windowShown,
    mark,
  }
  await current.setup(c)
  await record()
  t0 = Date.now()
  mark('start')
  await current.run(c)
  mark('end')
  if (ffmpeg) {
    ffmpeg.stdin.write('q')
    await new Promise((resolve) => ffmpeg.on('close', resolve))
  }
  const out = path.join(work, 'events', `${scene}-${mode}.json`)
  fs.writeFileSync(out, JSON.stringify(Object.fromEntries(events), null, 1))
  app.process().kill('SIGKILL')
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('FAIL', error)
    process.exit(1)
  },
)
