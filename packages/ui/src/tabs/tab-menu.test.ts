// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createTabMenu, placeMenu } from './tab-menu.ts'

function setup() {
  document.body.replaceChildren()
  const terminal = document.createElement('textarea')
  const element = document.createElement('div')
  element.setAttribute('role', 'menu')
  element.hidden = true
  document.body.append(terminal, element)
  terminal.focus()
  const ran: string[] = []
  const menu = createTabMenu(element)
  const open = () =>
    menu.open(
      [
        { label: 'Open in a new tab', enabled: true, run: () => void ran.push('tab') },
        { label: 'Disabled', enabled: false, run: () => void ran.push('disabled') },
        { label: 'Open in the file manager', enabled: true, run: () => void ran.push('files') },
      ],
      100,
      100,
      false,
      () => terminal.focus(),
    )
  const focused = () => document.activeElement?.textContent
  const press = (key: string) =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  return { menu, element, terminal, ran, open, focused, press }
}

describe('createTabMenu', () => {
  it('should focus the first item when it opens', () => {
    const { open, focused, element } = setup()

    open()

    expect(element.hidden).toBe(false)
    expect(focused()).toBe('Open in a new tab')
  })

  it('should move between the enabled items when the arrows are pressed', () => {
    const { open, focused, press } = setup()
    open()

    press('ArrowDown')
    const second = focused()
    press('ArrowDown')
    const wrapped = focused()
    press('ArrowUp')

    expect(second).toBe('Open in the file manager')
    expect(wrapped).toBe('Open in a new tab')
    expect(focused()).toBe('Open in the file manager')
  })

  it('should run the focused item and give the focus back when it is chosen', () => {
    const { open, press, ran, element, terminal } = setup()
    open()
    press('End')

    ;(document.activeElement as HTMLButtonElement).click()

    expect(ran).toEqual(['files'])
    expect(element.hidden).toBe(true)
    expect(document.activeElement).toBe(terminal)
  })

  it('should close without running anything and give the focus back when Escape is pressed', () => {
    const { open, press, ran, element, terminal } = setup()
    open()

    press('Escape')

    expect(ran).toEqual([])
    expect(element.hidden).toBe(true)
    expect(document.activeElement).toBe(terminal)
  })

  it('should close when the user clicks outside it', () => {
    const { open, element, terminal } = setup()
    open()

    terminal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(element.hidden).toBe(true)
  })

  it('should show the key as keycaps beside the label when the action has one', () => {
    const { menu, element } = setup()

    menu.open(
      [
        { label: 'Copy', enabled: false, key: '⌘C', run: () => undefined },
        { label: 'Paste', enabled: true, key: '⌘V', run: () => undefined },
      ],
      100,
      100,
      false,
    )

    const [copy, paste] = [...element.querySelectorAll('button')]
    expect(copy?.querySelector('span')?.textContent).toBe('Copy')
    expect([...(copy?.querySelectorAll('.key') ?? [])].map((key) => key.textContent)).toEqual([
      '⌘',
      'C',
    ])
    expect(copy?.disabled).toBe(true)
    expect(document.activeElement).toBe(paste)
  })

  it('should still focus the first enabled item when a pointer opens it', () => {
    const { menu } = setup()

    menu.open(
      [
        { label: 'Copy', enabled: false, run: () => undefined },
        { label: 'Paste', enabled: true, run: () => undefined },
      ],
      100,
      100,
      false,
      undefined,
      { pointer: true },
    )

    expect(document.activeElement?.textContent).toBe('Paste')
  })
})

describe('createTabMenu options', () => {
  function place(element: HTMLElement) {
    element.getBoundingClientRect = () => new DOMRect(0, 0, 180, 100)
  }

  it('should put its right edge on the given point when it is aligned to the end', () => {
    // Arrange
    const { menu, element } = setup()
    place(element)

    // Act
    menu.open(
      [{ label: 'Update', enabled: true, run: () => undefined }],
      700,
      400,
      true,
      undefined,
      {
        align: 'end',
      },
    )

    // Assert: 700 - 180 wide, and 6 above the point
    expect(element.style.left).toBe('520px')
    expect(element.style.top).toBe('294px')
  })

  it('should keep 4 px from the window edge when the aligned menu would overflow it', () => {
    // Arrange
    const { menu, element } = setup()
    place(element)

    // Act
    menu.open(
      [{ label: 'Update', enabled: true, run: () => undefined }],
      100,
      400,
      true,
      undefined,
      {
        align: 'end',
      },
    )

    // Assert
    expect(element.style.left).toBe('4px')
  })

  it('should show a caption the arrows skip and name the menu with it when one is given', () => {
    // Arrange
    const { menu, element, focused, press } = setup()

    // Act
    menu.open(
      [
        { label: 'Restart anyway', enabled: true, run: () => undefined },
        { label: 'Cancel', enabled: true, run: () => undefined },
      ],
      100,
      100,
      false,
      undefined,
      { caption: '1 tab has an agent running' },
    )
    const first = focused()
    press('ArrowDown')
    press('ArrowDown')

    // Assert
    const caption = element.querySelector('.menu-caption')
    expect(caption?.textContent).toBe('1 tab has an agent running')
    expect(caption?.getAttribute('tabindex')).toBeNull()
    expect(element.getAttribute('aria-labelledby')).toBe(caption?.id)
    expect(first).toBe('Restart anyway')
    expect(focused()).toBe('Restart anyway')
  })

  it('should close only its own opening when an old handle is closed', () => {
    // Arrange
    const { menu, element } = setup()
    const action = { label: 'Update', enabled: true, run: () => undefined }
    const old = menu.open([action], 100, 100, false)
    const current = menu.open([action], 100, 100, false)

    // Act
    old.close()
    const afterOld = element.hidden
    current.close()

    // Assert
    expect(afterOld).toBe(false)
    expect(element.hidden).toBe(true)
  })
})

describe('placeMenu', () => {
  const view = { width: 800, height: 300 }

  it('should open on the side asked when the menu fits there', () => {
    const place = placeMenu({ x: 100, y: 250, width: 180, height: 120, above: true }, view)

    expect(place).toEqual({ left: 100, top: 124 })
  })

  it('should open on the other side when only that side has room', () => {
    const place = placeMenu({ x: 100, y: 40, width: 180, height: 120, above: true }, view)

    expect(place).toEqual({ left: 100, top: 46 })
  })

  it('should take the window height with a 4 px margin when it fits on neither side', () => {
    const place = placeMenu({ x: 100, y: 150, width: 180, height: 400, above: false }, view)

    expect(place).toEqual({ left: 100, top: 4, maxHeight: 292 })
  })

  it('should keep 4 px from the right edge when the menu is wider than the room left', () => {
    const place = placeMenu({ x: 700, y: 20, width: 180, height: 40, above: false }, view)

    expect(place.left).toBe(616)
  })
})

describe('createTabMenu in a short window', () => {
  const actions = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      label: `file-${index}.ts`,
      enabled: true,
      run: () => undefined,
    }))

  it('should cap its height and keep the footer apart from the list when the window is too short', () => {
    // Arrange
    const { menu, element } = setup()
    element.getBoundingClientRect = () => new DOMRect(0, 0, 180, 900)
    const close = { label: 'Close file', enabled: true, run: () => undefined }

    // Act
    menu.open(actions(30), 100, 300, true, undefined, { caption: 'Recent', footer: [close] })

    // Assert
    expect(element.style.maxHeight).toBe(`${window.innerHeight - 8}px`)
    expect(element.style.top).toBe('4px')
    const list = element.querySelector('.menu-list.scroll')
    expect(list?.querySelectorAll('button')).toHaveLength(30)
    expect(element.querySelector('.menu-divider')?.getAttribute('role')).toBe('separator')
    expect(element.querySelector('.menu-footer')?.textContent).toBe('Close file')
  })

  it('should reach the footer and scroll each item into view when the arrows walk the list', () => {
    // Arrange
    const { menu, focused, press } = setup()
    const scrolled: string[] = []
    const scrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.textContent ?? '')
    }
    const close = { label: 'Close file', enabled: true, run: () => undefined }
    menu.open(actions(3), 100, 100, false, undefined, { footer: [close] })

    // Act
    press('End')
    const last = focused()
    press('ArrowDown')
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    // Assert
    expect(last).toBe('Close file')
    expect(focused()).toBe('file-0.ts')
    expect(scrolled).toEqual(['Close file', 'file-0.ts'])
  })

  it('should drop the cap of a short window when it opens again with room', () => {
    // Arrange
    const { menu, element } = setup()
    element.getBoundingClientRect = () => new DOMRect(0, 0, 180, 5000)
    menu.open(actions(3), 100, 100, false)
    element.getBoundingClientRect = () => new DOMRect(0, 0, 180, 60)

    // Act
    menu.open(actions(3), 100, 100, false)

    // Assert
    expect(element.style.maxHeight).toBe('')
    expect(element.style.top).toBe('106px')
  })

  it('should show the detail beside the label in its own span when an item has one', () => {
    const { menu, element } = setup()

    menu.open(
      [{ label: 'settings.json', detail: 'acme/api', enabled: true, run: () => undefined }],
      100,
      100,
      false,
    )

    const item = element.querySelector('button')
    expect(item?.querySelector('span')?.textContent).toBe('settings.json')
    expect(item?.querySelector('.menu-detail')?.textContent).toBe('acme/api')
  })
})
