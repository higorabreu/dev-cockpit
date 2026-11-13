// @vitest-environment happy-dom
import { createTranslator, type Orientation, type SplitPreference } from '@dck/core'
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

function setup(width: number, height = 700, initial: SplitPreference = 'side') {
  const host = document.createElement('div')
  document.body.append(host)
  const focused: string[] = []
  const narrowChanges: boolean[] = []
  const arrangements: (Orientation | undefined)[] = []
  const saved: [Orientation, number][] = []
  let shownChanges = 0
  const preferences = { preference: initial, ratios: { side: 0.5, stacked: 0.5 } }
  const view = createTabView(host, {
    t: createTranslator('en').t,
    preferences: () => preferences,
    onRatio: (orientation, ratio) => saved.push([orientation, ratio]),
    onArrange: (orientation, narrow) => {
      arrangements.push(orientation)
      narrowChanges.push(narrow)
    },
    onShownChange: () => {
      shownChanges += 1
    },
  })
  Object.defineProperty(view.element, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(view.element, 'clientHeight', { value: height, configurable: true })
  const terminal = pane('tab-1', 'terminal', focused)
  view.element.append(terminal.element)
  view.setTerminal(terminal)
  const review = pane('tab-1:review', 'review', focused)
  const divider = () => view.element.querySelector('.pane-divider') as HTMLElement
  const widths = () => [terminal.element.style.flex, review.element.style.flex]
  return {
    view,
    terminal,
    review,
    divider,
    widths,
    focused,
    narrowChanges,
    arrangements,
    saved,
    preferences,
    shownChanges: () => shownChanges,
  }
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

  it('should widen the review with the left arrow and save the share of that orientation', () => {
    const { view, review, divider, widths, saved } = setup(1201)
    view.open(review)

    key(divider(), 'ArrowLeft')
    key(divider(), 'ArrowLeft')
    key(divider(), 'ArrowUp')

    expect(widths()).toEqual(['0 0 568px', '0 0 632px'])
    expect(divider().getAttribute('aria-valuenow')).toBe('53')
    expect(saved.at(-1)?.[0]).toBe('side')
    expect(saved.at(-1)?.[1]).toBeCloseTo(568 / 1200, 3)
    expect(saved).toHaveLength(2)
  })

  it('should stack the review below the terminal with a horizontal divider when auto finds the tab too narrow for both', () => {
    const { view, review, divider, widths, arrangements } = setup(1400, 721, 'auto')

    view.open(review)

    expect(view.element.dataset.orientation).toBe('stacked')
    expect(divider().getAttribute('aria-orientation')).toBe('horizontal')
    expect(divider().getAttribute('aria-label')).toBe('Height of the review')
    expect(widths()).toEqual(['0 0 348px', '0 0 372px'])
    expect(arrangements.at(-1)).toBe('stacked')
  })

  it('should resize the stacked panes with the up and down arrows and leave the side share alone', () => {
    const { view, review, divider, widths, saved } = setup(1400, 1001, 'stacked')
    view.open(review)

    key(divider(), 'ArrowDown')
    key(divider(), 'ArrowLeft')

    expect(widths()).toEqual(['0 0 516px', '0 0 484px'])
    expect(saved).toEqual([['stacked', 0.516]])
  })

  it('should follow a new preference and the kept shares when asked to lay out again', () => {
    const { view, review, widths, preferences } = setup(1201, 1001)
    view.open(review)

    preferences.preference = 'stacked'
    preferences.ratios = { side: 0.5, stacked: 0.6 }
    view.relayout()

    expect(view.orientation()).toBe('stacked')
    expect(widths()).toEqual(['0 0 600px', '0 0 400px'])
  })

  it('should measure the panes so a smaller terminal font fits side by side in auto', () => {
    const { view, review, terminal } = setup(1700, 900, 'auto')
    terminal.grid = () => ({ cellWidth: 7.8, cellHeight: 16, frameWidth: 24, frameHeight: 16 })

    view.open(review)

    expect(view.orientation()).toBe('side')
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
    expect(widths()[0]).toBe('1 1 0px')
    expect(focused.at(-1)).toBe('tab-1')
    expect(terminal.element.hidden).toBe(false)
  })

  it('should tell when a narrow tab switches the pane it shows', () => {
    const { view, review, shownChanges } = setup(700)
    view.open(review)
    const afterOpen = shownChanges()

    view.focus('tab-1')
    view.focus('tab-1')

    expect(afterOpen).toBe(2)
    expect(shownChanges()).toBe(3)
  })

  it('should keep the terminal when asked to close it', () => {
    const { view, terminal } = setup(1201)

    view.close('tab-1')

    expect(terminal.element.isConnected).toBe(true)
  })
})
