// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { type CustomKeys, createKeymap, type Keyboard } from './keymap.ts'
import { bindShortcuts, type ShortcutActions } from './shortcuts.ts'

let unbind: () => void = () => undefined

afterEach(() => unbind())

function bind(keyboard: Keyboard, custom: CustomKeys = {}) {
  const ran: string[] = []
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      void ran.push([name, ...args].join(' '))
  const actions: ShortcutActions = {
    newTab: record('newTab'),
    closeTab: record('closeTab'),
    renameTab: record('renameTab'),
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
    searchFiles: record('searchFiles'),
    togglePanel: record('togglePanel'),
    toggleFullHeight: record('toggleFullHeight'),
    changeOpacity: record('changeOpacity'),
    changeFontSize: record('changeFontSize'),
    clearTerminal: record('clearTerminal'),
    toggleFile: record('toggleFile'),
    togglePreview: record('togglePreview'),
  }
  unbind = bindShortcuts(
    actions,
    createKeymap(keyboard, () => custom),
  )
  return ran
}

const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  document.body.dispatchEvent(event)
  return event
}

describe('bindShortcuts', () => {
  it('should run the action on its custom key and no longer on its default when the user changed it', () => {
    // Arrange
    const ran = bind('pc', { newTab: 'Ctrl+Alt+N' })

    // Act
    press({ key: 't', code: 'KeyT', ctrlKey: true, shiftKey: true })
    press({ key: 'n', code: 'KeyN', ctrlKey: true, altKey: true })

    // Assert
    expect(ran).toEqual(['newTab'])
  })

  it('should run the custom action before a tab digit when the user gave it Alt and a digit', () => {
    // Arrange
    const ran = bind('pc', { theme: 'Alt+2' })

    // Act
    press({ key: '2', code: 'Digit2', altKey: true })
    press({ key: '3', code: 'Digit3', altKey: true })

    // Assert
    expect(ran).toEqual(['toggleTheme', 'goToTab 2'])
  })

  it('should run the action that took a default key of another when both match', () => {
    // Arrange
    const ran = bind('pc', { theme: 'Ctrl+Shift+T' })

    // Act
    press({ key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true })

    // Assert
    expect(ran).toEqual(['toggleTheme'])
  })

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

  it('should go to the last tab when Cmd+9 is pressed on a Mac', () => {
    // Arrange
    const ran = bind('mac')

    // Act
    press({ key: '9', code: 'Digit9', metaKey: true })

    // Assert
    expect(ran).toEqual(['goToTab last'])
  })

  it('should make the font bigger with Ctrl and plus when the keyboard is a PC one', () => {
    // Arrange
    const ran = bind('pc')

    // Act
    press({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true })

    // Assert
    expect(ran).toEqual(['changeFontSize 1'])
  })

  it('should clear the terminal and keep the key from the shell when Cmd+K is pressed on a Mac', () => {
    // Arrange
    const ran = bind('mac')

    // Act
    const event = press({ key: 'k', code: 'KeyK', metaKey: true })

    // Assert
    expect(ran).toEqual(['clearTerminal'])
    expect(event.defaultPrevented).toBe(true)
  })

  it('should clear the terminal with Ctrl+Shift+K and leave Ctrl+K to the shell when the keyboard is a PC one', () => {
    // Arrange
    const ran = bind('pc')

    // Act
    press({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true })
    const plain = press({ key: 'k', code: 'KeyK', ctrlKey: true })

    // Assert
    expect(ran).toEqual(['clearTerminal'])
    expect(plain.defaultPrevented).toBe(false)
  })

  it('should switch between the file and the terminal with Ctrl+Shift+Space and keep the key from the editor', () => {
    // Arrange
    const ran = bind('pc')

    // Act
    const event = press({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true })
    const plain = press({ key: ' ', code: 'Space', ctrlKey: true })

    // Assert
    expect(ran).toEqual(['toggleFile'])
    expect(event.defaultPrevented).toBe(true)
    expect(plain.defaultPrevented).toBe(false)
  })

  it('should switch between the file and the terminal with Shift+Cmd+Space when the keyboard is a Mac one', () => {
    const ran = bind('mac')

    press({ key: ' ', code: 'Space', metaKey: true, shiftKey: true })

    expect(ran).toEqual(['toggleFile'])
  })

  it('should switch a Markdown file or an SVG between its views with Ctrl+Shift+J', () => {
    const ran = bind('pc')

    press({ key: 'J', code: 'KeyJ', ctrlKey: true, shiftKey: true })

    expect(ran).toEqual(['togglePreview'])
  })

  it('should open a tab with Ctrl+Shift+T when the keyboard is a PC one', () => {
    // Arrange
    const ran = bind('pc')

    // Act
    press({ key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true })

    // Assert
    expect(ran).toEqual(['newTab'])
  })

  it('should search files with Ctrl+Shift+O and leave Ctrl+P to the shell when the keyboard is a PC one', () => {
    // Arrange
    const ran = bind('pc')

    // Act
    press({ key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true })
    const shell = press({ key: 'p', code: 'KeyP', ctrlKey: true })

    // Assert
    expect(ran).toEqual(['searchFiles'])
    expect(shell.defaultPrevented).toBe(false)
  })

  it('should search files with Cmd+P when the keyboard is a Mac one', () => {
    // Arrange
    const ran = bind('mac')

    // Act
    press({ key: 'p', code: 'KeyP', metaKey: true })

    // Assert
    expect(ran).toEqual(['searchFiles'])
  })

  it('should search files with Ctrl+P when the user gave it that key', () => {
    // Arrange
    const ran = bind('pc', { fileSearch: 'Ctrl+P' })

    // Act
    press({ key: 'p', code: 'KeyP', ctrlKey: true })
    press({ key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true })

    // Assert
    expect(ran).toEqual(['searchFiles'])
  })
})
