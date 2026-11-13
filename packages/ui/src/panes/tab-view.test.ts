// @vitest-environment happy-dom
import { createTranslator, PANE_RATIO } from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createTabView, type PaneView } from './tab-view.ts'

function pane(id: string, kind: 'terminal' | 'review', focused: string[]): PaneView {
  const element = document.createElement('div')
  element.tabIndex = 0
  return {
    id,
    kind,
    element,
    focus: () => {
      focused.push(id)
      element.focus()
    },
  }
}

function setup(width: number) {
  const host = document.createElement('div')
  document.body.append(host)
  const focused: string[] = []
  const narrowChanges: boolean[] = []
  const memory = { ratio: PANE_RATIO.initial }
  const view = createTabView(host, {
    t: createTranslator('en').t,
    memory,
    onNarrow: (narrow) => narrowChanges.push(narrow),
  })
  Object.defineProperty(view.element, 'clientWidth', { value: width, configurable: true })
  const terminal = pane('tab-1', 'terminal', focused)
  view.element.append(terminal.element)
  view.setTerminal(terminal)
  const review = pane('tab-1:review', 'review', focused)
  const divider = () => view.element.querySelector('.pane-divider') as HTMLElement
  const widths = () => [terminal.element.style.flex, review.element.style.flex]
  return { view, terminal, review, divider, widths, focused, narrowChanges, memory }
}

const key = (target: Element, name: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))

afterEach(() => {
  document.body.replaceChildren()
})

describe('createTabView', () => {
  it('should put the review beside the terminal with a divider and focus it when the tab is wide', () => {
    const { view, review, divider, widths, focused } = setup(1201)

    view.open(review)

    expect(widths()).toEqual(['0 0 600px', '0 0 600px'])
    expect(divider().hidden).toBe(false)
    expect(divider().getAttribute('role')).toBe('separator')
    expect(divider().getAttribute('aria-valuenow')).toBe('50')
    expect(divider().getAttribute('aria-label')).toBe('Width of the review')
    expect(focused).toEqual(['tab-1:review'])
  })

  it('should widen the review with the left arrow and keep the share for the next split', () => {
    const { view, review, divider, widths, memory } = setup(1201)
    view.open(review)

    key(divider(), 'ArrowLeft')
    key(divider(), 'ArrowLeft')

    expect(widths()).toEqual(['0 0 568px', '0 0 632px'])
    expect(divider().getAttribute('aria-valuenow')).toBe('53')
    expect(memory.ratio).toBeCloseTo(568 / 1200, 3)
  })

  it('should go to the limits with Home and End when the divider has the focus', () => {
    const { view, review, divider } = setup(1201)
    view.open(review)

    key(divider(), 'End')
    const widest = divider().getAttribute('aria-valuenow')
    key(divider(), 'Home')

    expect(widest).toBe('37')
    expect(divider().getAttribute('aria-valuenow')).toBe('70')
    expect(divider().getAttribute('aria-valuemin')).toBe('37')
    expect(divider().getAttribute('aria-valuemax')).toBe('70')
  })

  it('should show only the focused pane when both do not fit', () => {
    const { view, terminal, review, divider, narrowChanges } = setup(700)

    view.open(review)
    const onReview = [terminal.element.hidden, review.element.hidden]
    view.focus('tab-1')

    expect(onReview).toEqual([true, false])
    expect([terminal.element.hidden, review.element.hidden]).toEqual([false, true])
    expect(divider().hidden).toBe(true)
    expect(narrowChanges).toEqual([true])
    expect(view.isShown('tab-1:review')).toBe(false)
  })

  it('should give the whole tab and the focus back to the terminal when the review closes', () => {
    const { view, terminal, review, widths, focused } = setup(1201)
    view.open(review)

    view.close('tab-1:review')

    expect(review.element.isConnected).toBe(false)
    expect(view.element.querySelector('.pane-divider')).toBeNull()
    expect(widths()[0]).toBe('0 0 1201px')
    expect(focused.at(-1)).toBe('tab-1')
    expect(terminal.element.hidden).toBe(false)
  })

  it('should keep the terminal when asked to close it', () => {
    const { view, terminal } = setup(1201)

    view.close('tab-1')

    expect(terminal.element.isConnected).toBe(true)
  })
})
