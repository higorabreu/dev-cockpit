// @vitest-environment happy-dom
import { createTranslator } from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createQuitCard } from './quit-card.ts'

// Each card listens on the window for good: one left open would hold the keys of the next test
const cards: HTMLElement[] = []
afterEach(() => {
  for (const element of cards) element.hidden = true
})

function setup(locale: 'en' | 'pt-BR' = 'en') {
  document.body.replaceChildren()
  const terminal = document.createElement('textarea')
  const element = document.createElement('div')
  element.hidden = true
  cards.push(element)
  document.body.append(terminal, element)
  terminal.focus()
  const calls: string[] = []
  const card = createQuitCard(element, {
    i18n: createTranslator(locale),
    quitKey: '⌘Q',
    answer: (quit) => void calls.push(quit ? 'quit' : 'stay'),
    closeOthers: () => void calls.push('close others'),
    done: () => terminal.focus(),
  })
  const button = (focus: string) =>
    element.querySelector<HTMLButtonElement>(`[data-focus="${focus}"]`)
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    ;(document.activeElement ?? document.body).dispatchEvent(event)
    return event
  }
  return { card, element, terminal, calls, button, press }
}

describe('createQuitCard', () => {
  it('should name how many tabs run a program and focus Cancel when the host asks', () => {
    const { card, element, button } = setup()

    card.ask(3)

    expect(element.hidden).toBe(false)
    expect(element.querySelector('.quit-title')?.textContent).toBe('Quit Dev Cockpit?')
    expect(element.querySelector('.quit-text')?.textContent).toBe('3 tabs have a program running.')
    expect(document.activeElement).toBe(button('quit-cancel'))
  })

  it('should write the line in the singular and in Portuguese when one tab runs a program', () => {
    const { card, element, button } = setup('pt-BR')

    card.ask(1)

    expect(element.querySelector('.quit-title')?.textContent).toBe('Sair do Dev Cockpit?')
    expect(element.querySelector('.quit-text')?.textContent).toBe(
      '1 aba tem um programa em execução.',
    )
    expect(button('quit-confirm')?.textContent).toBe('Sair')
    expect(button('quit-cancel')?.textContent).toBe('Cancelar')
  })

  it('should close what was open under it before it shows', () => {
    const { card, calls } = setup()

    card.ask(2)

    expect(calls).toEqual(['close others'])
  })

  it('should answer quit when Quit is clicked', () => {
    // Arrange
    const { card, element, calls, button } = setup()
    card.ask(1)

    // Act
    button('quit-confirm')?.click()

    // Assert
    expect(calls.at(-1)).toBe('quit')
    expect(element.hidden).toBe(true)
  })

  it('should answer stay and give the keys back to the terminal when Cancel is clicked', () => {
    // Arrange
    const { card, element, terminal, calls, button } = setup()
    card.ask(1)

    // Act
    button('quit-cancel')?.click()

    // Assert
    expect(calls.at(-1)).toBe('stay')
    expect(element.hidden).toBe(true)
    expect(document.activeElement).toBe(terminal)
  })

  it('should answer stay when Escape is pressed', () => {
    // Arrange
    const { card, calls, press } = setup()
    card.ask(2)

    // Act
    const event = press('Escape')

    // Assert
    expect(event.defaultPrevented).toBe(true)
    expect(calls.at(-1)).toBe('stay')
  })

  it('should keep the cockpit keys quiet without preventing them while it is open', () => {
    // Arrange
    const { card, press } = setup()
    const reached: string[] = []
    window.addEventListener('keydown', (event) => void reached.push(event.key), true)
    card.ask(2)

    // Act
    const quit = press('q', { metaKey: true })
    press('t', { metaKey: true })
    press('Enter')

    // Assert
    expect(reached).toEqual(['Enter'])
    expect(quit.defaultPrevented).toBe(false)
  })

  it('should keep the focus inside the card when Tab passes its last button', () => {
    // Arrange
    const { card, press, button } = setup()
    card.ask(2)
    button('quit-confirm')?.focus()

    // Act
    press('Tab')

    // Assert
    expect(document.activeElement).toBe(button('quit-cancel'))
  })

  it('should answer only once when it is closed twice', () => {
    // Arrange
    const { card, calls, button, press } = setup()
    card.ask(1)

    // Act
    button('quit-cancel')?.click()
    press('Escape')

    // Assert
    expect(calls.filter((call) => call === 'stay')).toHaveLength(1)
  })

  it('should let keys through when it is closed', () => {
    // Arrange
    const { press } = setup()
    const reached: string[] = []
    window.addEventListener('keydown', (event) => void reached.push(event.key), true)

    // Act
    press('t', { metaKey: true })

    // Assert
    expect(reached).toEqual(['t'])
  })
})
