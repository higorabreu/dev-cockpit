import { ViewPlugin } from '@codemirror/view'
import { BLINK_MS } from '../terminal/cursor-blink.ts'

// The class on the editor that hides its cursor for half a period (styles/editor.css)
export const EDITOR_CURSOR_OFF = 'cm-cursor-off'

// CodeMirror's blink is a CSS animation that keeps a frame running and doubled the echo (D58, F0); this
// toggles a class twice a second, only while the editor has the focus, and shows the cursor again on
// every change of the text or the selection
export const timerBlink = ViewPlugin.define((view) => {
  let timer: ReturnType<typeof setTimeout> | undefined

  function restart() {
    clearTimeout(timer)
    timer = undefined
    view.dom.classList.remove(EDITOR_CURSOR_OFF)
    if (!view.hasFocus || document.hidden) return
    const tick = () => {
      view.dom.classList.toggle(EDITOR_CURSOR_OFF)
      timer = setTimeout(tick, BLINK_MS)
    }
    timer = setTimeout(tick, BLINK_MS)
  }

  // A hidden window blinks nothing, and shows its cursor at once when it comes back
  document.addEventListener('visibilitychange', restart)
  restart()
  return {
    update(update) {
      if (update.docChanged || update.selectionSet || update.focusChanged) restart()
    },
    destroy() {
      document.removeEventListener('visibilitychange', restart)
      clearTimeout(timer)
    },
  }
})
