// Half of xterm's blink period: the cursor shows for this long, then hides for as long
export const BLINK_MS = 500
// The class on the session that hides a blinking cursor (styles/terminal.css)
export const CURSOR_OFF = 'cursor-off'

export interface BlinkOptions {
  // The session element, which carries the phase class
  readonly element: HTMLElement
  // xterm's input field: while it has the focus, xterm draws a blinking cursor
  readonly textarea: HTMLElement
  readonly document: Document
  // A timer that can be cancelled, so tests drive it with a fake clock
  after(milliseconds: number, task: () => void): () => void
}

// xterm's DOM renderer blinks with an infinite CSS animation, which Chromium runs every frame; this
// blinks the same cursor with a timer, two frames a second, and only while focused and on screen
export function attachCursorBlink(options: BlinkOptions) {
  const { element, textarea, document } = options
  let focused = document.activeElement === textarea
  let cancel: (() => void) | undefined
  const controller = new AbortController()
  const { signal } = controller

  function schedule() {
    cancel = options.after(BLINK_MS, () => {
      element.classList.toggle(CURSOR_OFF)
      schedule()
    })
  }

  // Shows the cursor and starts the period again, as xterm does when the cursor moves or a key is typed
  function restart() {
    cancel?.()
    cancel = undefined
    element.classList.remove(CURSOR_OFF)
    if (focused && !document.hidden) schedule()
  }

  textarea.addEventListener(
    'focus',
    () => {
      focused = true
      restart()
    },
    { signal },
  )
  textarea.addEventListener(
    'blur',
    () => {
      focused = false
      restart()
    },
    { signal },
  )
  document.addEventListener('visibilitychange', restart, { signal })
  restart()

  return {
    restart,
    dispose() {
      controller.abort()
      cancel?.()
      cancel = undefined
    },
  }
}
