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
    if (element.classList.contains('cue')) return 24
    if (element.classList.contains('list'))
      return 12 + visibleRows(element) * PITCH + element.querySelectorAll('.cue').length * 24
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

const mouse = (type: string, button: number, target: EventTarget = document.body) => {
  const event = new MouseEvent(type, { button, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

// A short window by default: the compact wheel, moved down, leaves room for two rows above it. The
// trigger is a key or a mouse button (`Mouse1`)
function setup(windowHeight = 340, trigger = 'ControlRight') {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: windowHeight })
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
      run: (_category, item) => runs.push(item),
      triggerCode: () => trigger,
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
  const button = trigger.startsWith('Mouse') ? Number(trigger.slice(5)) : undefined
  // Hold the trigger until the menu opens, then pick the only sector
  if (button === undefined) key('keydown', trigger)
  else mouse('mousedown', button)
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
  const release = () => (button === undefined ? key('keyup', trigger) : mouse('mouseup', button))
  return { scrim, card, list, selected, visible, release, runs }
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
    window: Object.getOwnPropertyDescriptor(window, 'innerHeight'),
  }

  beforeEach(fakeLayout)

  afterEach(() => {
    if (descriptors.height)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', descriptors.height)
    if (descriptors.top) Object.defineProperty(HTMLElement.prototype, 'offsetTop', descriptors.top)
    if (descriptors.window) Object.defineProperty(window, 'innerHeight', descriptors.window)
    else Reflect.deleteProperty(window, 'innerHeight')
  })

  it('should move the wheel down so every row fits above it when centering leaves too little room', () => {
    // Arrange and Act: centered in 600 pixels, the wheel leaves 182 above it; the seven rows need 243
    const menu = setup(600)

    // Assert
    expect(menu.visible()).toEqual(['0', '1', '2', '3', '4', '5', '6'])
    expect(menu.card.style.top).toBe('263px')
    expect(menu.card.style.getPropertyValue('--wheel')).toBe('196px')
    menu.release()
  })

  it('should place the wheel without a slide each time the menu opens', () => {
    // Arrange
    const menu = setup()
    const placedWhileOpen = menu.card.dataset.placed

    // Act
    menu.release()

    // Assert: the slide is on only once the wheel is on screen, so it never starts from the last opening
    expect(placedWhileOpen).toBe('')
    expect(menu.card.dataset.placed).toBeUndefined()
  })

  it('should close the menu and let the click reach the terminal when it lands off the card', () => {
    // Arrange: the trigger was held long enough to open the menu over a link
    const menu = setup()
    const terminal = document.createElement('div')
    document.body.append(terminal)

    // Act
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, ctrlKey: true })
    terminal.dispatchEvent(press)

    // Assert
    expect(menu.scrim.classList.contains('open')).toBe(false)
    expect(press.defaultPrevented).toBe(false)
    menu.release()
    expect(menu.runs).toEqual([])
  })

  it('should keep the wheel of the mouse from the terminal while the menu is open', () => {
    const menu = setup()
    const terminal = document.createElement('div')
    document.body.append(terminal)

    const turned = wheel(terminal, 100)

    expect(turned.defaultPrevented).toBe(true)
    menu.release()
  })

  it('should draw the compact wheel when the window is short', () => {
    const menu = setup()

    expect(menu.card.style.getPropertyValue('--wheel')).toBe('164px')
    menu.release()
  })

  it('should window the list and show a cue below when the rows do not fit above the wheel', () => {
    // Arrange and Act: the wheel sits at the bottom of a short window and leaves room for two rows
    const menu = setup()

    // Assert
    expect(menu.visible()).toEqual(['0', '1'])
    expect(menu.list().querySelector('button.cue')?.getAttribute('aria-label')).toBe('5 more below')
    menu.release()
  })

  it('should select the next hidden row without running it when the cue below is clicked', () => {
    // Arrange
    const menu = setup()
    const cue = menu.list().querySelector<HTMLElement>('button.cue')

    // Act
    cue?.click()

    // Assert
    expect(menu.selected()).toBe('2')
    expect(menu.visible()).toEqual(['1', '2'])
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

describe('createHoldMenuController with a mouse button', () => {
  it('should open the wheel and run the selected row when the middle button is held and released', () => {
    // Arrange
    const menu = setup(340, 'Mouse1')
    const opened = menu.scrim.classList.contains('open')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))

    // Act
    menu.release()

    // Assert
    expect(opened).toBe(true)
    expect(menu.runs.map((item) => item.id)).toEqual(['tab:1'])
    expect(menu.scrim.classList.contains('open')).toBe(false)
  })

  it('should keep the button from the terminal when it is the trigger', () => {
    // Arrange
    const menu = setup(340, 'Mouse1')
    const terminal = document.createElement('div')
    document.body.append(terminal)
    const reached: string[] = []
    for (const type of ['mousedown', 'mouseup', 'auxclick'])
      terminal.addEventListener(type, () => reached.push(type))

    // Act
    const events = ['mousedown', 'mouseup', 'auxclick'].map((type) => mouse(type, 1, terminal))
    menu.release()

    // Assert
    expect(reached).toEqual([])
    expect(events.every((event) => event.defaultPrevented)).toBe(true)
  })

  it('should leave the other buttons to the terminal when the trigger is the back button', () => {
    // Arrange
    const menu = setup(340, 'Mouse3')
    menu.release()

    // Act
    const right = mouse('auxclick', 2)
    const back = mouse('auxclick', 3)

    // Assert
    expect(right.defaultPrevented).toBe(false)
    expect(back.defaultPrevented).toBe(true)
  })

  it('should close without running anything when Esc is pressed while the button is held', () => {
    // Arrange
    const menu = setup(340, 'Mouse4')

    // Act
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    menu.release()

    // Assert
    expect(menu.runs).toEqual([])
    expect(menu.scrim.classList.contains('open')).toBe(false)
  })
})

// A mouse whose button sends press and release together: the trigger is clicked, never held
function clickSetup(trigger = 'Mouse3') {
  const button = Number(trigger.slice(5))
  document.body.replaceChildren()
  const [scrim, card, hint, bar, terminal] = ['div', 'div', 'div', 'div', 'textarea'].map((tag) =>
    document.createElement(tag),
  ) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLTextAreaElement]
  scrim.append(card, hint)
  document.body.append(scrim, bar, terminal)
  terminal.focus()
  const tasks: (() => void)[] = []
  const runs: MenuItem[] = []
  createHoldMenuController(
    { scrim, card, hint, bar },
    {
      categories: () => [TABS],
      run: (_category, item) => runs.push(item),
      triggerCode: () => trigger,
    },
    {
      after(_milliseconds, task) {
        tasks.push(task)
        return () => {
          const index = tasks.indexOf(task)
          if (index >= 0) tasks.splice(index, 1)
        }
      },
    },
    createTranslator('en').t,
  )
  const click = (target: EventTarget = terminal) =>
    ['mousedown', 'mouseup', 'auxclick'].map((type) => mouse(type, button, target))
  const key = (name: string) => {
    const event = new KeyboardEvent('keydown', {
      key: name,
      code: name,
      bubbles: true,
      cancelable: true,
    })
    terminal.dispatchEvent(event)
    return event
  }
  const isOpen = () => scrim.classList.contains('open')
  const row = (index: number) => {
    const found = card.querySelector<HTMLElement>(`[data-item="${index}"]`)
    if (!found) throw new Error('invariant: the open sector shows the row')
    return found
  }
  return { hint, terminal, tasks, runs, click, key, isOpen, row }
}

describe('createHoldMenuController after a click of a mouse trigger', () => {
  it('should open the menu and keep it open when the button is released at once', () => {
    // Arrange
    const menu = clickSetup()

    // Act
    const events = menu.click()

    // Assert
    expect(menu.isOpen()).toBe(true)
    expect(menu.tasks).toEqual([])
    expect(menu.runs).toEqual([])
    expect(events.every((event) => event.defaultPrevented)).toBe(true)
  })

  it('should say a click or Enter runs and Esc closes when the menu stays open', () => {
    // Arrange
    const menu = clickSetup()

    // Act
    menu.click()

    // Assert
    expect(menu.hint.textContent).toContain('or click to run')
    expect(menu.hint.textContent).toContain('close')
    expect(menu.hint.textContent).not.toContain('release to run')
  })

  it('should run a row and close when it is clicked', () => {
    // Arrange
    const menu = clickSetup()
    menu.click()
    menu.key('ArrowUp')

    // Act
    menu.row(2).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    // Assert
    expect(menu.runs.map((item) => item.id)).toEqual(['tab:2'])
    expect(menu.isOpen()).toBe(false)
  })

  it('should run the selected row when Enter is pressed after the arrows', () => {
    // Arrange
    const menu = clickSetup()
    menu.click()
    menu.key('ArrowUp')
    menu.key('ArrowDown')

    // Act
    const enter = menu.key('Enter')

    // Assert
    expect(enter.defaultPrevented).toBe(true)
    expect(menu.runs.map((item) => item.id)).toEqual(['tab:1'])
    expect(menu.isOpen()).toBe(false)
  })

  it('should close without running anything when Esc is pressed', () => {
    // Arrange
    const menu = clickSetup()
    menu.click()
    menu.key('ArrowUp')

    // Act
    const esc = menu.key('Escape')

    // Assert
    expect(esc.defaultPrevented).toBe(true)
    expect(menu.isOpen()).toBe(false)
    expect(menu.runs).toEqual([])
  })

  it('should close and let the click reach the terminal when it lands off the card', () => {
    // Arrange
    const menu = clickSetup()
    menu.click()

    // Act
    const press = mouse('mousedown', 0, menu.terminal)

    // Assert
    expect(menu.isOpen()).toBe(false)
    expect(press.defaultPrevented).toBe(false)
    expect(menu.runs).toEqual([])
  })

  it('should close without running anything when the button is clicked again', () => {
    // Arrange
    const menu = clickSetup()
    menu.click()
    menu.key('ArrowUp')

    // Act
    const events = menu.click()

    // Assert
    expect(menu.isOpen()).toBe(false)
    expect(menu.tasks).toEqual([])
    expect(menu.runs).toEqual([])
    expect(events.every((event) => event.defaultPrevented)).toBe(true)
  })

  it('should open again when the button is clicked after the menu closed', () => {
    // Arrange
    const menu = clickSetup()
    menu.click()
    menu.click()

    // Act
    menu.click()

    // Assert
    expect(menu.isOpen()).toBe(true)
  })

  it('should close and let the key reach the terminal when a key that writes is pressed', () => {
    // Arrange
    const menu = clickSetup()
    menu.click()

    // Act
    const shift = menu.key('Shift')
    const openAfterShift = menu.isOpen()
    const letter = menu.key('a')

    // Assert
    expect(openAfterShift).toBe(true)
    expect(shift.defaultPrevented).toBe(false)
    expect(menu.isOpen()).toBe(false)
    expect(letter.defaultPrevented).toBe(false)
    expect(menu.runs).toEqual([])
  })

  it('should keep the focus on the terminal when a row of the card is pressed', () => {
    // Arrange
    const menu = clickSetup()
    menu.click()
    menu.key('ArrowUp')

    // Act
    const press = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true })
    menu.row(1).dispatchEvent(press)

    // Assert
    expect(press.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(menu.terminal)
  })

  it('should not open when a key trigger is tapped and released at once', () => {
    // Arrange
    const menu = clickSetup('ControlRight')
    const tap = (type: 'keydown' | 'keyup') =>
      window.dispatchEvent(new KeyboardEvent(type, { code: 'ControlRight', key: 'Control' }))

    // Act
    tap('keydown')
    tap('keyup')
    for (const task of menu.tasks.splice(0)) task()

    // Assert
    expect(menu.isOpen()).toBe(false)
  })
})
