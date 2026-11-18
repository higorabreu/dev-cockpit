// @vitest-environment happy-dom
import { createTranslator, emptyTabs, openTab } from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createTabBar } from './tab-bar.ts'

function setup(language: 'en' | 'pt-BR' = 'en', middleClickCloses = true) {
  const container = document.createElement('div')
  document.body.append(container)
  const renames: [string, string | undefined][] = []
  const closed: string[] = []
  const bar = createTabBar(
    container,
    {
      activate: () => undefined,
      contextMenu: () => undefined,
      close: (id) => void closed.push(id),
      middleClickCloses: () => middleClickCloses,
      reorder: () => undefined,
      rename: (id, name) => void renames.push([id, name]),
    },
    createTranslator(language).t,
  )
  const state = openTab(openTab(emptyTabs, { id: 'tab-1', label: 'acme' }), {
    id: 'tab-2',
    label: 'shell 2',
  })
  return { container, bar, state, renames, closed }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('createTabBar review mark', () => {
  it('should mark a tab whose review is hidden behind its terminal with a named glyph and its key', () => {
    const { container, bar, state } = setup()

    bar.render(state, new Map(), new Set(['tab-1']))

    const mark = container.querySelector('[data-id="tab-1"] .pip.review')
    expect(mark?.getAttribute('role')).toBe('img')
    expect(mark?.getAttribute('aria-label')).toBe('Review open')
    expect(mark?.getAttribute('data-tip')).toBe('Review open')
    expect(mark?.getAttribute('data-tip-shortcut')).toBe('review')
    expect(mark?.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('[data-id="tab-2"] .pip')).toBeNull()
  })

  it('should name the mark in portuguese when the interface is in portuguese', () => {
    const { container, bar, state } = setup('pt-BR')

    bar.render(state, new Map(), new Set(['tab-2']))

    expect(
      container.querySelector('[data-id="tab-2"] .pip.review')?.getAttribute('aria-label'),
    ).toBe('Revisão aberta')
  })

  it('should keep both marks when the tab also needs the user', () => {
    const { container, bar, state } = setup()

    bar.render(state, new Map([['tab-1', 'needs-you']]), new Set(['tab-1']))

    expect(
      [...container.querySelectorAll('[data-id="tab-1"] .pip')].map((pip) => pip.className),
    ).toEqual(['pip needs-you', 'pip review'])
  })
})

describe('createTabBar rename', () => {
  const field = (container: HTMLElement) => container.querySelector<HTMLInputElement>('.tab-name')
  const key = (target: HTMLElement, name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    return event
  }

  it('should turn the tab name into a focused field with the name selected when a rename starts', () => {
    // Arrange
    const { container, bar, state } = setup()
    bar.render(state)

    // Act
    bar.rename('tab-2')

    // Assert
    const input = field(container)
    expect(input?.value).toBe('shell 2')
    expect(input?.getAttribute('aria-label')).toBe('Tab name')
    expect(document.activeElement).toBe(input)
    expect(container.querySelector('.tab.editing')?.getAttribute('data-id')).toBe('tab-2')
  })

  it('should give the typed name back and redraw the tab when Enter is pressed', () => {
    const { container, bar, state, renames } = setup()
    bar.render(state)
    bar.rename('tab-2')
    const input = field(container) as HTMLInputElement
    input.value = 'api billing'

    const event = key(input, 'Enter')

    expect(renames).toEqual([['tab-2', 'api billing']])
    expect(event.defaultPrevented).toBe(true)
    expect(field(container)).toBeNull()
  })

  it('should cancel and keep Esc from the rest of the app when Esc is pressed', () => {
    const { container, bar, state, renames } = setup()
    bar.render(state)
    bar.rename('tab-1')
    const input = field(container) as HTMLInputElement
    input.value = 'changed'
    const reached: string[] = []
    const listen = (event: KeyboardEvent) => void reached.push(event.key)
    window.addEventListener('keydown', listen)

    key(input, 'Escape')

    window.removeEventListener('keydown', listen)
    expect(renames).toEqual([['tab-1', undefined]])
    expect(reached).toEqual([])
    expect(container.querySelector('[data-id="tab-1"] .tab-label')?.textContent).toBe('acme')
  })

  it('should keep the typed name when the field loses the focus', () => {
    const { container, bar, state, renames } = setup()
    bar.render(state)
    bar.rename('tab-1')
    const input = field(container) as HTMLInputElement
    input.value = 'web'

    input.dispatchEvent(new FocusEvent('blur'))

    expect(renames).toEqual([['tab-1', 'web']])
  })

  it('should not redraw the bar while a name is being typed and draw the latest state after it', () => {
    // Arrange
    const { container, bar, state } = setup()
    bar.render(state)
    bar.rename('tab-1')

    // Act: a mark arrives while the field is open
    bar.render(state, new Map([['tab-2', 'finished' as const]]))
    const stillEditing = field(container) !== null
    key(field(container) as HTMLInputElement, 'Escape')

    // Assert
    expect(stillEditing).toBe(true)
    expect(container.querySelector('[data-id="tab-2"] .pip')).not.toBeNull()
  })

  it('should start a rename when the tab is clicked twice, even after the first click redrew the bar', () => {
    // Arrange
    const { container, bar, state } = setup()
    bar.render(state)
    const click = () =>
      container
        .querySelector('[data-id="tab-1"] .tab-label')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // Act: activating a tab redraws the bar between the two clicks
    click()
    bar.render(state)
    click()

    // Assert
    expect(field(container)?.value).toBe('acme')
  })

  it('should only activate when two clicks land on different tabs', () => {
    const { container, bar, state } = setup()
    bar.render(state)

    for (const id of ['tab-1', 'tab-2'])
      container
        .querySelector(`[data-id="${id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(field(container)).toBeNull()
  })

  it('should show the automatic name as the hint when the tab was renamed before', () => {
    const { container, bar } = setup()
    bar.render(openTab(emptyTabs, { id: 'tab-1', label: 'api', autoLabel: 'acme' }))

    bar.rename('tab-1')

    expect(field(container)?.placeholder).toBe('acme')
  })
})

describe('createTabBar redraw', () => {
  it('should keep the focus on the same tab when the bar redraws', () => {
    // Arrange
    const { container, bar, state } = setup()
    bar.render(state)
    container.querySelector<HTMLElement>('[data-id="tab-1"]')?.focus()

    // Act: a watcher's read redraws every tab
    bar.render(state)

    // Assert
    expect((document.activeElement as HTMLElement | null)?.dataset.id).toBe('tab-1')
  })
})

describe('createTabBar middle click', () => {
  const press = (container: HTMLElement, id: string, type: string, button: number) => {
    const event = new MouseEvent(type, { button, bubbles: true, cancelable: true })
    container.querySelector(`[data-id="${id}"]`)?.dispatchEvent(event)
    return event
  }

  it('should close the tab with no question when the middle button clicks it', () => {
    // Arrange
    const { container, bar, state, closed } = setup()
    bar.render(state)

    // Act
    const down = press(container, 'tab-2', 'mousedown', 1)
    const up = press(container, 'tab-2', 'mouseup', 1)
    const click = press(container, 'tab-2', 'auxclick', 1)

    // Assert: no focus move, autoscroll or paste of the selection on Linux
    expect(closed).toEqual(['tab-2'])
    expect([down, up, click].map((event) => event.defaultPrevented)).toEqual([true, true, true])
  })

  it('should keep the tab when the middle button opens the hold menu', () => {
    // Arrange
    const { container, bar, state, closed } = setup('en', false)
    bar.render(state)

    // Act
    press(container, 'tab-2', 'auxclick', 1)

    // Assert
    expect(closed).toEqual([])
  })

  it('should keep the tab when another side button clicks it', () => {
    // Arrange
    const { container, bar, state, closed } = setup()
    bar.render(state)

    // Act
    const down = press(container, 'tab-1', 'mousedown', 3)
    press(container, 'tab-1', 'auxclick', 3)

    // Assert
    expect(closed).toEqual([])
    expect(down.defaultPrevented).toBe(false)
  })
})
