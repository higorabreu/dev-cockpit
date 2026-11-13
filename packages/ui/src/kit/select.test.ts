// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createSelect, type SelectOption } from './select.ts'

const THEMES: readonly SelectOption[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'sepia', label: 'Sepia' },
]

function setup(overrides: { value?: string; disabled?: boolean } = {}) {
  document.body.replaceChildren()
  const label = document.createElement('span')
  label.id = 'theme-label'
  label.textContent = 'Theme'
  const changes: string[] = []
  const control = createSelect({
    id: 'theme',
    options: THEMES,
    value: overrides.value ?? 'dark',
    labelledBy: 'theme-label',
    disabled: overrides.disabled,
    onChange: (value) => changes.push(value),
  })
  document.body.append(label, control.element)
  control.button.focus()
  const list = control.element.querySelector<HTMLElement>('[role="listbox"]')
  if (!list) throw new Error('invariant: the select has a listbox')
  return { control, button: control.button, list, changes }
}

const press = (target: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('createSelect overflow', () => {
  it('should mark its list as overflowing when the options are taller than the list', async () => {
    const { button, list } = setup()
    Object.defineProperty(list, 'scrollHeight', { get: () => 600 })
    Object.defineProperty(list, 'clientHeight', { get: () => 300 })

    press(button, 'Enter')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(list.hasAttribute('data-overflow')).toBe(true)
  })
})

const shown = (button: HTMLElement) =>
  button.querySelector('[data-current]')?.textContent ?? undefined

const activeLabel = (button: HTMLElement) => {
  const id = button.getAttribute('aria-activedescendant')
  return id ? document.getElementById(id)?.textContent : undefined
}

const option = (list: HTMLElement, label: string) => {
  const found = [...list.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (element) => element.textContent === label,
  )
  if (!found) throw new Error(`invariant: option ${label} exists`)
  return found
}

describe('createSelect', () => {
  it('should show the current label and stay closed when it is created', () => {
    const { button, list } = setup({ value: 'light' })

    expect(shown(button)).toBe('Light')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(list.hidden).toBe(true)
  })

  it('should describe a select-only combobox when the attributes are read', () => {
    const { button, list } = setup()

    expect(button.getAttribute('role')).toBe('combobox')
    expect(button.getAttribute('aria-controls')).toBe(list.id)
    expect(button.getAttribute('aria-labelledby')).toBe('theme-label')
    expect(list.getAttribute('role')).toBe('listbox')
    expect(list.getAttribute('aria-labelledby')).toBe('theme-label')
    expect(button.hasAttribute('aria-activedescendant')).toBe(false)
  })

  it('should open on the selected option with the check on it when the button is clicked', () => {
    const { button, list } = setup({ value: 'system' })

    button.click()

    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(list.hidden).toBe(false)
    expect(activeLabel(button)).toBe('System')
    const selected = list.querySelectorAll('[aria-selected="true"]')
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('System')
    expect(selected[0]?.querySelector('svg')).not.toBeNull()
    expect(option(list, 'Dark').getAttribute('aria-selected')).toBe('false')
    expect(option(list, 'Dark').querySelector('svg')).toBeNull()
  })

  it.each([
    ['Enter', {}],
    [' ', {}],
    ['ArrowDown', {}],
    ['ArrowDown', { altKey: true }],
    ['ArrowUp', {}],
  ])('should open on the selected option when %s is pressed while closed', (key, init) => {
    const { button } = setup({ value: 'light' })

    const event = press(button, key, init)

    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(activeLabel(button)).toBe('Light')
    expect(event.defaultPrevented).toBe(true)
  })

  it('should open on the first and the last option when Home and End are pressed while closed', () => {
    const { button } = setup({ value: 'light' })

    press(button, 'Home')
    const first = activeLabel(button)
    press(button, 'Escape')
    press(button, 'End')

    expect(first).toBe('Dark')
    expect(activeLabel(button)).toBe('Sepia')
  })

  it('should move the active option without wrapping when the arrows are pressed', () => {
    const { button } = setup({ value: 'dark' })
    press(button, 'ArrowDown')

    press(button, 'ArrowUp')
    const atTop = activeLabel(button)
    press(button, 'ArrowDown')
    press(button, 'ArrowDown')

    expect(atTop).toBe('Dark')
    expect(activeLabel(button)).toBe('System')
    expect(document.querySelector('.on')?.textContent).toBe('System')
  })

  it('should jump to the first and the last option when Home and End are pressed while open', () => {
    const { button } = setup({ value: 'light' })
    press(button, 'Enter')

    press(button, 'End')
    const last = activeLabel(button)
    press(button, 'Home')

    expect(last).toBe('Sepia')
    expect(activeLabel(button)).toBe('Dark')
  })

  it('should jump to the next option starting with the typed letter when a letter is typed', () => {
    const { button } = setup({ value: 'dark' })
    press(button, 'Enter')

    press(button, 's')
    const first = activeLabel(button)
    press(button, 'S')
    const second = activeLabel(button)
    press(button, 's')

    expect(first).toBe('System')
    expect(second).toBe('Sepia')
    expect(activeLabel(button)).toBe('System')
  })

  it('should open on the matching option when a letter is typed while closed', () => {
    const { button } = setup({ value: 'dark' })

    press(button, 'l')

    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(activeLabel(button)).toBe('Light')
  })

  it('should stay closed when a typed letter matches no option', () => {
    const { button } = setup()

    const event = press(button, 'x')

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(event.defaultPrevented).toBe(false)
  })

  it.each(['Enter', ' '])('should pick the active option and close when %s is pressed', (key) => {
    const { button, list, changes } = setup({ value: 'dark' })
    press(button, 'ArrowDown')
    press(button, 'ArrowDown')

    press(button, key)

    expect(changes).toEqual(['light'])
    expect(shown(button)).toBe('Light')
    expect(list.hidden).toBe(true)
    expect(button.hasAttribute('aria-activedescendant')).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('should pick the active option and close when Alt+Up is pressed while open', () => {
    const { button, changes } = setup({ value: 'dark' })
    press(button, 'Enter')
    press(button, 'End')

    press(button, 'ArrowUp', { altKey: true })

    expect(changes).toEqual(['sepia'])
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('should not report a change when the selected option is picked again', () => {
    const { button, changes } = setup({ value: 'dark' })
    press(button, 'Enter')

    press(button, 'Enter')

    expect(changes).toEqual([])
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('should close without changing and keep the Escape from the screen around when Escape is pressed', () => {
    const { control, button, changes } = setup({ value: 'dark' })
    let reachedScreen = false
    document.body.addEventListener('keydown', () => {
      reachedScreen = true
    })
    press(button, 'Enter')
    press(button, 'ArrowDown')

    const event = press(button, 'Escape')

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(changes).toEqual([])
    expect(shown(control.button)).toBe('Dark')
    expect(event.defaultPrevented).toBe(true)
    expect(reachedScreen).toBe(false)
  })

  it('should let Escape reach the screen around when the list is closed', () => {
    const { button } = setup()
    let reachedScreen = false
    document.body.addEventListener('keydown', () => {
      reachedScreen = true
    })

    press(button, 'Escape')

    expect(reachedScreen).toBe(true)
  })

  it('should close without changing and let the focus move when Tab is pressed', () => {
    const { button, changes } = setup({ value: 'dark' })
    press(button, 'Enter')
    press(button, 'ArrowDown')

    const event = press(button, 'Tab')

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(changes).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('should pick an option and close when it is clicked', () => {
    const { button, list, changes } = setup({ value: 'dark' })
    button.click()

    option(list, 'Light').click()

    expect(changes).toEqual(['light'])
    expect(shown(button)).toBe('Light')
    expect(list.hidden).toBe(true)
  })

  it('should keep the focus on the button when the mouse presses an option', () => {
    const { button, list } = setup()
    button.click()
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })

    option(list, 'Light').dispatchEvent(press)

    expect(press.defaultPrevented).toBe(true)
  })

  it('should make the hovered option the active one when the mouse moves over it', () => {
    const { button, list } = setup({ value: 'dark' })
    button.click()

    option(list, 'System').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))

    expect(activeLabel(button)).toBe('System')
  })

  it('should explain an option in its tooltip and show the chosen one on the closed button', () => {
    const { control, button, list } = setup()
    control.setOptions([
      { value: 'dark', label: 'Dark', tip: 'Follows the terminal' },
      { value: 'light', label: 'Light' },
    ])
    button.click()

    expect(option(list, 'Dark').dataset.tip).toBe('Follows the terminal')
    expect(button.dataset.tip).toBe('Follows the terminal')
    option(list, 'Light').click()
    expect(button.dataset.tip).toBeUndefined()
  })

  it('should list a disabled option without letting it be picked', () => {
    const { control, button, list, changes } = setup()
    control.setOptions([
      { value: 'dark', label: 'Dark' },
      { value: 'light', label: 'Light', disabled: true, tip: 'Not available' },
    ])
    button.click()

    option(list, 'Light').click()
    press(button, 'ArrowDown')
    press(button, 'Enter')

    expect(option(list, 'Light').getAttribute('aria-disabled')).toBe('true')
    expect(changes).toEqual([])
    expect(list.hidden).toBe(false)
  })

  it('should close when the button is clicked again', () => {
    const { button } = setup()
    button.click()

    button.click()

    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('should only close the list when the mouse presses outside it while open', () => {
    const { button, list, changes } = setup()
    const outside = document.createElement('div')
    document.body.append(outside)
    let reached = false
    document.body.addEventListener('mousedown', () => {
      reached = true
    })
    button.click()

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    expect(list.hidden).toBe(true)
    expect(reached).toBe(false)
    expect(changes).toEqual([])
  })

  it('should let a mouse press outside reach the page when the list is closed', () => {
    const { list } = setup()
    const outside = document.createElement('div')
    document.body.append(outside)
    let reached = false
    document.body.addEventListener('mousedown', () => {
      reached = true
    })

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    expect(list.hidden).toBe(true)
    expect(reached).toBe(true)
  })

  it('should close without changing when the focus leaves the button', () => {
    const { button, changes } = setup()
    const outside = document.createElement('button')
    document.body.append(outside)
    button.click()

    outside.focus()

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(changes).toEqual([])
  })

  it('should neither open nor change when it is disabled', () => {
    const { button, list, changes } = setup({ disabled: true })

    button.click()
    press(button, 'Enter')

    expect(button.disabled).toBe(true)
    expect(list.hidden).toBe(true)
    expect(changes).toEqual([])
  })

  it('should show the new value and the new labels when setValue and setOptions are called', () => {
    const { control, button } = setup({ value: 'dark' })

    control.setValue('system')
    const afterValue = shown(button)
    control.setOptions(THEMES.map((theme) => ({ ...theme, label: theme.label.toUpperCase() })))

    expect(afterValue).toBe('System')
    expect(shown(button)).toBe('SYSTEM')
  })

  it('should keep the picked value and the focus when the screen rebuilds it from the store', () => {
    document.body.replaceChildren()
    const store = { theme: 'dark' }
    const build = () => {
      const control = createSelect({
        id: 'theme',
        options: THEMES,
        value: store.theme,
        labelledBy: 'theme-label',
        onChange: (value) => {
          store.theme = value
        },
      })
      control.button.dataset.focus = 'set-theme'
      return control
    }
    const first = build()
    document.body.replaceChildren(first.element)
    first.button.focus()
    press(first.button, 'Enter')
    press(first.button, 'ArrowDown')
    press(first.button, 'Enter')

    const focused = document.activeElement?.getAttribute('data-focus')
    const second = build()
    document.body.replaceChildren(second.element)
    document.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus()

    expect(store.theme).toBe('light')
    expect(shown(second.button)).toBe('Light')
    expect(document.activeElement).toBe(second.button)
  })
})

describe('createSelect with a secondary text', () => {
  it('should show the detail beside the option in the list and only the label when closed', () => {
    document.body.replaceChildren()
    const control = createSelect({
      id: 'project',
      options: [
        { value: '', label: 'All projects', detail: '6' },
        { value: 'NTF', label: 'NTF', detail: '4' },
      ],
      value: 'NTF',
      labelledBy: 'project-label',
      onChange: () => undefined,
    })
    document.body.append(control.element)

    control.button.click()

    const details = [...control.element.querySelectorAll('[role="option"] .select-detail')]
    expect(details.map((detail) => detail.textContent)).toEqual(['6', '4'])
    expect(shown(control.button)).toBe('NTF')
  })
})
