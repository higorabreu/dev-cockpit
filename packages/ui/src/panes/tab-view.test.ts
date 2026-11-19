// @vitest-environment happy-dom
import { createTranslator, type Orientation, type SplitPreference } from '@dck/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTabView, motionMs, type PaneView } from './tab-view.ts'

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

function setup(width: number, height = 700, initial: SplitPreference = 'side', animate = false) {
  const host = document.createElement('div')
  document.body.append(host)
  const focused: string[] = []
  const narrowChanges: boolean[] = []
  const arrangements: (Orientation | undefined)[] = []
  const saved: [Orientation, number][] = []
  let shownChanges = 0
  let moved = 0
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
    animate: () => animate,
    onMoved: () => {
      moved += 1
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
    moved: () => moved,
  }
}

const key = (target: Element, name: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('createTabView', () => {
  it('should put the review beside the terminal with a divider and focus it when the tab is wide', () => {
    const { view, review, divider, widths, focused } = setup(1201)

    view.open(review)

    expect(widths()).toEqual(['0 1 600px', '0 1 600px'])
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

    expect(widths()).toEqual(['0 1 568px', '0 1 632px'])
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
    expect(widths()).toEqual(['0 1 348px', '0 1 372px'])
    expect(arrangements.at(-1)).toBe('stacked')
  })

  it('should resize the stacked panes with the up and down arrows and leave the side share alone', () => {
    const { view, review, divider, widths, saved } = setup(1400, 1001, 'stacked')
    view.open(review)

    key(divider(), 'ArrowDown')
    key(divider(), 'ArrowLeft')

    expect(widths()).toEqual(['0 1 516px', '0 1 484px'])
    expect(saved).toEqual([['stacked', 0.516]])
  })

  it('should keep no share when the divider is held at a pane minimum', () => {
    const { view, review, divider, widths, saved } = setup(1400, 721, 'stacked')
    view.open(review)

    key(divider(), 'ArrowDown')
    key(divider(), 'ArrowDown')

    expect(widths()).toEqual(['0 1 348px', '0 1 372px'])
    expect(saved).toEqual([])
  })

  it('should follow a new preference and the kept shares when asked to lay out again', () => {
    const { view, review, widths, preferences } = setup(1201, 1001)
    view.open(review)

    preferences.preference = 'stacked'
    preferences.ratios = { side: 0.5, stacked: 0.6 }
    view.relayout()

    expect(view.orientation()).toBe('stacked')
    expect(widths()).toEqual(['0 1 600px', '0 1 400px'])
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

describe('createTabView sliding', () => {
  it('should slide the review in from nothing and focus it only when the motion ends', () => {
    // Arrange
    vi.useFakeTimers()
    const { view, review, widths, focused, moved } = setup(1201, 700, 'side', true)

    // Act
    view.open(review)
    const during = {
      moving: view.isMoving(),
      marked: view.element.hasAttribute('data-moving'),
      widths: widths(),
      focused: [...focused],
    }
    vi.advanceTimersByTime(400)

    // Assert
    expect(during).toEqual({
      moving: true,
      marked: true,
      widths: ['0 1 600px', '0 1 600px'],
      focused: [],
    })
    expect(view.isMoving()).toBe(false)
    expect(view.element.hasAttribute('data-moving')).toBe(false)
    expect(focused).toEqual(['tab-1:review'])
    expect(moved()).toBe(1)
  })

  it('should end the slide when the review pane finishes its transition', () => {
    // Arrange
    vi.useFakeTimers()
    const { view, review, moved } = setup(1201, 700, 'side', true)
    view.open(review)

    // Act
    const end = new Event('transitionend') as TransitionEvent
    Object.defineProperty(end, 'propertyName', { value: 'flex-basis' })
    review.element.dispatchEvent(end)

    // Assert
    expect(view.isMoving()).toBe(false)
    expect(moved()).toBe(1)
  })

  it('should shrink the review away and remove it only when the motion ends', () => {
    // Arrange
    vi.useFakeTimers()
    const { view, review, widths, focused } = setup(1201, 700, 'side', true)
    view.open(review)
    vi.advanceTimersByTime(400)

    // Act
    view.close('tab-1:review')
    const during = { connected: review.element.isConnected, widths: widths() }
    vi.advanceTimersByTime(400)

    // Assert
    expect(during).toEqual({ connected: true, widths: ['0 1 1200px', '0 1 0px'] })
    expect(review.element.isConnected).toBe(false)
    expect(focused.at(-1)).toBe('tab-1')
  })

  it('should slide the review over the whole tab and then hide the terminal when the tab is narrow', () => {
    // Arrange
    vi.useFakeTimers()
    const { view, terminal, review, widths } = setup(700, 700, 'side', true)

    // Act
    view.open(review)
    const during = { widths: widths(), terminalHidden: terminal.element.hidden }
    vi.advanceTimersByTime(400)

    // Assert
    expect(during).toEqual({ widths: ['0 1 0px', '0 1 699px'], terminalHidden: false })
    expect(terminal.element.hidden).toBe(true)
    expect(review.element.hidden).toBe(false)
  })

  it('should finish a slide at once when the review is closed while it opens', () => {
    // Arrange
    vi.useFakeTimers()
    const { view, review, focused } = setup(1201, 700, 'side', true)
    view.open(review)

    // Act
    view.close('tab-1:review')
    const focusedOnOpen = [...focused]
    vi.advanceTimersByTime(400)

    // Assert
    expect(focusedOnOpen).toEqual(['tab-1:review'])
    expect(review.element.isConnected).toBe(false)
  })

  it('should not slide when motion is reduced', () => {
    const { view, review, focused } = setup(1201)

    view.open(review)

    expect(view.isMoving()).toBe(false)
    expect(view.element.hasAttribute('data-moving')).toBe(false)
    expect(focused).toEqual(['tab-1:review'])
  })

  it('should keep sliding when the focus moves in a narrow tab while the review slides in', () => {
    // Arrange
    vi.useFakeTimers()
    const { view, terminal, review, widths } = setup(700, 700, 'side', true)
    view.open(review)

    // Act
    terminal.element.focus()
    const during = { widths: widths(), terminalHidden: terminal.element.hidden }
    vi.advanceTimersByTime(400)

    // Assert
    expect(during).toEqual({ widths: ['0 1 0px', '0 1 699px'], terminalHidden: false })
    expect(terminal.element.hidden).toBe(true)
  })

  it.each([
    ['170ms', 170],
    ['0.17s', 170],
    ['', 170],
  ])('should read the motion as %j in milliseconds when the style gives it so', (value, ms) => {
    const element = document.createElement('div')
    element.style.setProperty('--motion-normal', value)
    document.body.append(element)

    expect(motionMs(element)).toBe(ms)
  })
})
