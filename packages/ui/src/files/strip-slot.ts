import { h } from '../panel/dom.ts'

// The fold lasts --motion-fast; past this it ends even if no animation ran (a hidden window)
const FOLD_LIMIT_MS = 400

// The place under the file's header for its strip. A strip that comes or goes on a shown file folds open or
// closed (styles/file-view.css) while the file's body keeps the height it has with no strip, so the editor
// measures once and not at every frame; a strip that only changes its words is replaced in place
export function createStripSlot(view: HTMLElement) {
  const slot = h('div', { class: 'fv-strip-slot' })
  let live: HTMLElement | undefined
  let finish: (() => void) | undefined

  const moves = () =>
    view.isConnected && !view.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches

  function fold(element: HTMLElement, direction: 'in' | 'out', done: () => void) {
    finish?.()
    if (!moves()) return done()
    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      finish = undefined
      element.removeEventListener('animationend', onEnd)
      element.removeAttribute('data-fold')
      view.removeAttribute('data-strip-moving')
      done()
    }
    const onEnd = (event: Event) => {
      if (event.target === element) end()
    }
    finish = end
    element.setAttribute('data-fold', direction)
    view.setAttribute('data-strip-moving', '')
    element.addEventListener('animationend', onEnd)
    setTimeout(end, FOLD_LIMIT_MS)
  }

  return {
    element: slot,
    set(content: HTMLElement | undefined) {
      if (content && live) return live.replaceChildren(content)
      if (content) {
        const opening = h('div', { class: 'fv-strip-fold' }, content)
        live = opening
        slot.append(opening)
        return fold(opening, 'in', () => undefined)
      }
      if (!live) return
      // Gone for the keyboard and the reader at once; only its picture folds away
      const leaving = live
      live = undefined
      leaving.inert = true
      leaving.setAttribute('aria-hidden', 'true')
      fold(leaving, 'out', () => leaving.remove())
    },
  }
}
