export interface ResizeEdgeDeps {
  readonly edge: HTMLElement
  // Shows the height while dragging, in percent of the screen
  readonly label: HTMLElement
  // The host moves the window and answers the fraction of the screen it takes; undefined when it is locked
  resize(height: number): Promise<number | undefined>
  end(keep: boolean): void
  toggleFullHeight(): void
  // The terminals hold their grid while dragging and fit when the pointer rests and when it is over
  hold(held: boolean): void
  settle(): void
}

// A press that moves less than this is a click (or the first half of a double click), not a drag
const DRAG_THRESHOLD = 3
// Pointer at rest this long while dragging: the terminals fit the size reached so far
const SETTLE_MS = 150

// The bottom edge of the window as a handle: the window follows the pointer and keeps its top
export function createResizeEdge(deps: ResizeEdgeDeps) {
  const { edge, label } = deps
  type Drag = { pointer: number; startY: number; grab: number; moved: boolean }
  let drag: Drag | undefined
  let wanted: number | undefined
  let busy = false
  let settleTimer: ReturnType<typeof setTimeout> | undefined

  function show(ratio: number) {
    label.textContent = `${Math.round(ratio * 100)}%`
    label.hidden = false
  }

  // One request at a time: a fast pointer sends only the latest height once the host answered
  async function push(height: number) {
    wanted = height
    if (busy) return
    busy = true
    while (wanted !== undefined && drag) {
      const next = wanted
      wanted = undefined
      const ratio = await deps.resize(next)
      if (ratio === undefined) {
        finish(false)
        break
      }
      if (drag) show(ratio)
    }
    busy = false
  }

  function finish(keep: boolean) {
    const ended = drag
    if (!ended) return
    drag = undefined
    wanted = undefined
    clearTimeout(settleTimer)
    if (edge.hasPointerCapture(ended.pointer)) edge.releasePointerCapture(ended.pointer)
    edge.removeAttribute('data-drag')
    document.body.removeAttribute('data-resizing')
    label.hidden = true
    if (!ended.moved) return
    deps.end(keep)
    deps.hold(false)
    deps.settle()
  }

  edge.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    edge.setPointerCapture(event.pointerId)
    drag = {
      pointer: event.pointerId,
      startY: event.clientY,
      grab: window.innerHeight - event.clientY,
      moved: false,
    }
  })

  edge.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return
    if (!drag.moved) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return
      drag.moved = true
      edge.dataset.drag = 'true'
      document.body.dataset.resizing = 'true'
      deps.hold(true)
    }
    // The top stays where it is, so the pointer's place in the window is the height it asks for
    void push(Math.round(event.clientY + drag.grab))
    clearTimeout(settleTimer)
    settleTimer = setTimeout(deps.settle, SETTLE_MS)
  })

  edge.addEventListener('pointerup', () => finish(true))
  edge.addEventListener('lostpointercapture', () => finish(true))
  edge.addEventListener('dblclick', () => deps.toggleFullHeight())
  // Esc puts the window back as it was; captured first so the terminal does not get it
  window.addEventListener(
    'keydown',
    (event) => {
      if (!drag?.moved || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    },
    true,
  )

  return {
    // The height can be locked by an environment variable: the edge is then not offered at all
    setEnabled(enabled: boolean) {
      edge.hidden = !enabled
      if (!enabled) finish(false)
    },
  }
}
