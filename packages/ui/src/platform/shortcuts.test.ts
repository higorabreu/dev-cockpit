// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createKeymap, type Keyboard } from './keymap.ts'
import { bindShortcuts, type ShortcutActions } from './shortcuts.ts'

let unbind: () => void = () => undefined

afterEach(() => unbind())

function bind(keyboard: Keyboard) {
  const ran: string[] = []
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      void ran.push([name, ...args].join(' '))
  const actions: ShortcutActions = {
    newTab: record('newTab'),
    closeTab: record('closeTab'),
    toggleReview: record('toggleReview'),
    toggleReviewLayout: record('toggleReviewLayout'),
    sendReview: record('sendReview'),
    nextTab: record('nextTab'),
    previousTab: record('previousTab'),
    goToTab: record('goToTab'),
    toggleTheme: record('toggleTheme'),
    openSettings: record('openSettings'),
    openViews: record('openViews'),
    searchProjects: record('searchProjects'),
    togglePanel: record('togglePanel'),
    toggleFullHeight: record('toggleFullHeight'),
    changeOpacity: record('changeOpacity'),
    changeFontSize: record('changeFontSize'),
  }
  unbind = bindShortcuts(actions, createKeymap(keyboard))
  return ran
}

const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  document.body.dispatchEvent(event)
  return event
}

describe('bindShortcuts', () => {
  it('should send the review and keep Enter from the shell when Ctrl+Shift+Enter is pressed', () => {
    // Arrange
    const ran = bind('pc')

    // Act
    const event = press({ key: 'Enter', code: 'Enter', ctrlKey: true, shiftKey: true })

    // Assert
    expect(ran).toEqual(['sendReview'])
    expect(event.defaultPrevented).toBe(true)
  })

  it('should open a tab and keep the key from the shell when Cmd+T is pressed on a Mac', () => {
    // Arrange
    const ran = bind('mac')

    // Act
    const event = press({ key: 't', code: 'KeyT', metaKey: true })

    // Assert
    expect(ran).toEqual(['newTab'])
    expect(event.defaultPrevented).toBe(true)
  })

  it('should leave Ctrl+C to the shell when it is pressed on a Mac', () => {
    // Arrange
    const ran = bind('mac')

    // Act
    const event = press({ key: 'c', code: 'KeyC', ctrlKey: true })

    // Assert
    expect(ran).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('should go to the third tab when Cmd+3 is pressed on a Mac', () => {
    // Arrange
    const ran = bind('mac')

    // Act
    press({ key: '3', code: 'Digit3', metaKey: true })

    // Assert
    expect(ran).toEqual(['goToTab 2'])
  })

  it('should make the font bigger with Ctrl and plus when the keyboard is a PC one', () => {
    // Arrange
    const ran = bind('pc')

    // Act
    press({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true })

    // Assert
    expect(ran).toEqual(['changeFontSize 1'])
  })

  it('should open a tab with Ctrl+Shift+T when the keyboard is a PC one', () => {
    // Arrange
    const ran = bind('pc')

    // Act
    press({ key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true })

    // Assert
    expect(ran).toEqual(['newTab'])
  })
})
