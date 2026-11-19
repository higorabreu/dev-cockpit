// Preload that inject.cjs adds to the cockpit's page, in an isolated world: it shares the DOM and the
// events with the app but none of its code. It reports, through IPC, when the first prompt is drawn,
// when each typed key is echoed, when the page becomes visible and how the review's lists scroll.
// `frame` is the end of the frame that drew the change: a message posted from inside the frame runs once
// the frame is committed.
const { ipcRenderer } = require('electron')

const PROMPT = 'dck-perf$ '
const now = () => performance.timeOrigin + performance.now()
const send = (kind, data = {}) => ipcRenderer.send('dck-perf', { kind, ...data })
const textOf = (element) => (element.textContent ?? '').replace(/\u00a0/g, ' ')

function afterFrame(callback) {
  const channel = new MessageChannel()
  channel.port1.onmessage = () => {
    channel.port1.close()
    callback(now())
  }
  channel.port2.postMessage(null)
}

function promptRows() {
  return [...document.querySelectorAll('.xterm-rows')].find((rows) => textOf(rows).includes(PROMPT))
}

// Each printable key is a pending echo until the prompt line shows everything typed so far
function watchEcho(rows) {
  let typed = ''
  const pending = []
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey && event.key === 'u') {
        typed = ''
        pending.length = 0
        return
      }
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return
      typed += event.key
      pending.push({ text: typed, key: performance.timeOrigin + event.timeStamp })
    },
    true,
  )
  new MutationObserver(() => {
    if (pending.length === 0) return
    const text = textOf(rows)
    while (pending.length > 0 && text.includes(PROMPT + pending[0].text)) {
      const { key } = pending.shift()
      const dom = now()
      afterFrame((frame) => send('echo', { key, dom, frame }))
    }
  }).observe(rows, { childList: true, subtree: true, characterData: true })
}

function watchPrompt() {
  const observer = new MutationObserver(() => {
    const rows = promptRows()
    if (!rows) return
    observer.disconnect()
    const dom = now()
    afterFrame((frame) => send('prompt', { dom, frame }))
    watchEcho(rows)
  })
  observer.observe(document, { childList: true, subtree: true, characterData: true })
}

document.addEventListener('visibilitychange', () => {
  const at = now()
  if (document.visibilityState !== 'visible') {
    send('hidden', { state: document.visibilityState })
    return
  }
  requestAnimationFrame(() => afterFrame((frame) => send('visible', { change: at, frame })))
})

// The review's panes, in screen pixels, once its file list holds the changed files: the driver points the
// wheel at them
function boxOf(element) {
  if (!element) return undefined
  const rect = element.getBoundingClientRect()
  return {
    x: window.screenX + rect.x,
    y: window.screenY + rect.y,
    width: rect.width,
    height: rect.height,
    rows: element.firstElementChild?.childElementCount ?? 0,
    scrollHeight: element.scrollHeight,
  }
}

function watchReview() {
  const end = Date.now() + 30000
  const timer = setInterval(() => {
    const files = document.querySelector('.rv-files')
    const lines = document.querySelector('.rv-lines')
    const ready = files && lines && files.scrollHeight > files.clientHeight * 4
    if (!ready && Date.now() < end) return
    clearInterval(timer)
    if (ready) send('review', { files: boxOf(files), lines: boxOf(lines) })
  }, 250)
}

window.addEventListener(
  'keydown',
  (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') watchReview()
  },
  true,
)

// While the wheel turns, a requestAnimationFrame loop stamps every frame of the page's main thread,
// where the virtualized lists draw their rows; it stops 500 ms after the last notch
let scroll
function finishScroll() {
  const { list, start, frames, last } = scroll
  scroll = undefined
  const times = frames.filter((time) => time <= last + 50)
  const gaps = times.slice(1).map((time, i) => time - times[i])
  const sorted = [...gaps].sort((a, b) => a - b)
  const span = times[times.length - 1] - times[0]
  send('scroll', {
    pane: list?.className ?? '',
    frames: times.length,
    fps: span > 0 ? ((times.length - 1) / span) * 1000 : 0,
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    late: gaps.length > 0 ? (gaps.filter((gap) => gap > 20).length / gaps.length) * 100 : 0,
    moved: (list?.scrollTop ?? 0) - start,
  })
}

window.addEventListener(
  'wheel',
  (event) => {
    const now = performance.now()
    if (!scroll) {
      const list = event.target instanceof Element ? event.target.closest('.scroll') : null
      scroll = { list, start: list?.scrollTop ?? 0, frames: [], last: now }
      const tick = (time) => {
        if (!scroll) return
        scroll.frames.push(time)
        if (performance.now() - scroll.last > 500) finishScroll()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
    scroll.last = now
  },
  { capture: true, passive: true },
)

watchPrompt()
