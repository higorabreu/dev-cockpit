// @vitest-environment happy-dom
import { createTranslator, type MenuCategory, type MenuItem } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHoldMenuController } from './hold-menu-controller.ts'

const PITCH = 33

// happy-dom has no layout: rows get a fixed height, and the list is as tall as its rows and cues
function fakeLayout() {
  const visibleRows = (list: Element) => list.querySelectorAll('.it:not(.gone)').length
  const height = (element: HTMLElement) => {
    if (element.classList.contains('it')) return element.classList.contains('gone') ? 0 : PITCH - 1
    if (element.classList.contains('cue')) return 14
    if (element.classList.contains('list'))
      return 12 + visibleRows(element) * PITCH + element.querySelectorAll('.cue').length * 14
    return 0
  }
  const top = (element: HTMLElement) => {
    const rows = [...(element.parentElement?.querySelectorAll('.it:not(.gone)') ?? [])]
    return Math.max(0, rows.indexOf(element)) * PITCH
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return height(this)
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      return top(this)
    },
  })
}

const TABS: MenuCategory = {
  id: 'tabs',
  label: 'Tabs',
  icon: 'window',
  items: Array.from({ length: 7 }, (_, index) => ({ id: `tab:${index}`, label: `Tab ${index}` })),
}

function setup() {
  document.body.replaceChildren()
  const [scrim, card, hint, bar] = ['div', 'div', 'div', 'div'].map((tag) =>
    document.createElement(tag),
  ) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement]
  scrim.append(card, hint)
  document.body.append(scrim, bar)
  const tasks: (() => void)[] = []
  const runs: MenuItem[] = []
  createHoldMenuController(
    { scrim, card, hint, bar },
    {
      categories: () => [TABS],
      tabs: () => [],
      run: (_category, item) => runs.push(item),
      switchTo: () => undefined,
      triggerCode: () => 'ControlRight',
    },
    {
      after(_milliseconds, task) {
        tasks.push(task)
        return () => undefined
      },
    },
    createTranslator('en').t,
  )
  const key = (type: 'keydown' | 'keyup', code: string, key = code) =>
    window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }))
  // Hold the trigger until the menu opens, then pick the only sector
  key('keydown', 'ControlRight')
  for (const task of tasks.splice(0)) task()
  key('keydown', 'ArrowUp')
  const list = () => {
    const element = card.querySelector<HTMLElement>('.list')
    if (!element) throw new Error('invariant: the open sector has a list')
    return element
  }
  const selected = () => list().querySelector<HTMLElement>('.it.on')?.dataset.item
  const visible = () =>
    [...list().querySelectorAll<HTMLElement>('.it:not(.gone)')].map((row) => row.dataset.item)
  const release = () => key('keyup', 'ControlRight')
  return { list, selected, visible, release, runs }
}

const wheel = (target: HTMLElement, deltaY: number) => {
  const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('createHoldMenuController list', () => {
  const descriptors = {
    height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
    top: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop'),
  }

  beforeEach(fakeLayout)

  afterEach(() => {
    if (descriptors.height)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', descriptors.height)
    if (descriptors.top) Object.defineProperty(HTMLElement.prototype, 'offsetTop', descriptors.top)
  })

  it('should window the list and show a cue below when the rows do not fit above the wheel', () => {
    // Arrange and Act: a wheel at the top of the window leaves no room above it
    const menu = setup()

    // Assert
    expect(menu.visible()).toEqual(['0'])
    expect(menu.list().querySelector('button.cue')?.getAttribute('aria-label')).toBe('6 more below')
    menu.release()
  })

  it('should select the next hidden row without running it when the cue below is clicked', () => {
    // Arrange
    const menu = setup()
    const cue = menu.list().querySelector<HTMLElement>('button.cue')

    // Act
    cue?.click()

    // Assert
    expect(menu.selected()).toBe('1')
    expect(menu.visible()).toEqual(['1'])
    expect(menu.runs).toEqual([])
    menu.release()
  })

  it('should keep the focus where it was when a cue is pressed', () => {
    const menu = setup()
    const cue = menu.list().querySelector<HTMLElement>('button.cue')
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })

    cue?.dispatchEvent(press)

    expect(press.defaultPrevented).toBe(true)
    menu.release()
  })

  it('should move the selection one row per notch when the mouse wheel turns over the list', () => {
    // Arrange
    const menu = setup()

    // Act
    const events = [wheel(menu.list(), 100), wheel(menu.list(), 100)]

    // Assert
    expect(events.every((event) => event.defaultPrevented)).toBe(true)
    expect(menu.selected()).toBe('2')
    menu.release()
  })

  it('should add up small deltas into one row when a touchpad scrolls the list', () => {
    const menu = setup()

    for (const delta of [15, 15, 15]) wheel(menu.list(), delta)

    expect(menu.selected()).toBe('1')
    menu.release()
  })

  it('should move the selection up when the mouse wheel turns the other way', () => {
    const menu = setup()
    wheel(menu.list(), 100)
    wheel(menu.list(), 100)

    wheel(menu.list(), -100)

    expect(menu.selected()).toBe('1')
    menu.release()
  })

  it('should stop at the last row when the mouse wheel turns past it', () => {
    const menu = setup()

    for (let notch = 0; notch < 10; notch++) wheel(menu.list(), 100)

    expect(menu.selected()).toBe('6')
    menu.release()
  })

  it('should run the row the mouse wheel selected when the trigger is released', () => {
    const menu = setup()
    for (let notch = 0; notch < 3; notch++) wheel(menu.list(), 100)

    menu.release()

    expect(menu.runs.map((item) => item.id)).toEqual(['tab:3'])
  })
})
