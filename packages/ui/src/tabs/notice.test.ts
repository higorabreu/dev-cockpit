// @vitest-environment happy-dom
import { createTranslator } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotice, MIN_STRIP_PX } from './notice.ts'

function setup() {
  document.body.replaceChildren()
  const element = document.createElement('div')
  document.body.append(element)
  const notice = createNotice(element, createTranslator('en'))
  return { element, notice }
}

afterEach(() => vi.useRealTimers())

describe('createNotice', () => {
  it('should keep the width and the line of an update notice while a copy shows over it', () => {
    // Arrange
    vi.useFakeTimers()
    const { element, notice } = setup()
    const text = document.createElement('span')
    text.textContent = 'Version 0.10.0 available'
    notice.setLasting([text])
    element.getBoundingClientRect = () => new DOMRect(0, 0, 335, 30)

    // Act
    notice.copied('copy this line')
    const during = { width: element.style.minWidth, lasting: element.classList.contains('lasting') }
    vi.advanceTimersByTime(2000)

    // Assert
    expect(during).toEqual({ width: '335px', lasting: true })
    expect(element.style.minWidth).toBe('')
    expect(element.textContent).toBe('Version 0.10.0 available')
  })

  it('should show a copy alone with no line when there is no lasting notice', () => {
    // Arrange
    vi.useFakeTimers()
    const { element, notice } = setup()

    // Act
    notice.copied('abc')

    // Assert
    expect(element.classList.contains('lasting')).toBe(false)
    expect(element.style.minWidth).toBe('')
    expect(element.textContent).toBe('Copied3 characters')
    vi.advanceTimersByTime(2000)
    expect(element.textContent).toBe('')
  })
})

describe('createNotice compact form', () => {
  // Set by the stand-in ResizeObserver: the test calls it as the window's width changes
  let resized: () => void = () => undefined
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback
        }
        observe() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  // The full form is 335 px wide and the icon 37 px; the strip gets what the shown form leaves
  const FULL = 335
  const ICON = 37

  function compactSetup(roomBesideFull: number) {
    document.body.replaceChildren()
    const strip = document.createElement('div')
    const element = document.createElement('div')
    document.body.append(strip, element)
    const room = { besideFull: roomBesideFull }
    const shown = () => (element.classList.contains('compact') ? ICON : FULL)
    element.getBoundingClientRect = () => new DOMRect(0, 0, shown(), 30)
    strip.getBoundingClientRect = () => new DOMRect(0, 0, room.besideFull + FULL - shown(), 30)
    const notice = createNotice(element, createTranslator('en'), strip)
    const text = document.createElement('span')
    text.textContent = 'Version 0.10.0 available'
    const icon = document.createElement('button')
    icon.setAttribute('aria-label', 'Version 0.10.0 available')
    return { element, notice, room, text, icon, strip }
  }

  it('should show the full form when the tabs keep their room beside it', () => {
    // Arrange
    const { element, notice, text, icon } = compactSetup(MIN_STRIP_PX)

    // Act
    notice.setLasting([text], [icon])

    // Assert
    expect(element.classList.contains('compact')).toBe(false)
    expect([...element.childNodes]).toEqual([text])
  })

  it('should show the compact form when the full one would leave the tabs too little room', () => {
    // Arrange
    const { element, notice, text, icon } = compactSetup(MIN_STRIP_PX - 1)

    // Act
    notice.setLasting([text], [icon])

    // Assert
    expect(element.classList.contains('compact')).toBe(true)
    expect([...element.childNodes]).toEqual([icon])
  })

  it('should follow the window and keep the focused icon when the width changes within a form', () => {
    // Arrange
    const { element, notice, room, text, icon } = compactSetup(300)
    notice.setLasting([text], [icon])
    icon.focus()

    // Act
    room.besideFull = 400
    resized()
    const kept = document.activeElement === icon
    room.besideFull = 900
    resized()

    // Assert
    expect(kept).toBe(true)
    expect(element.classList.contains('compact')).toBe(false)
    expect([...element.childNodes]).toEqual([text])
  })

  it('should show a copy over the compact form and hold its width when text is copied', () => {
    // Arrange
    vi.useFakeTimers()
    const { element, notice, text, icon } = compactSetup(300)
    notice.setLasting([text], [icon])

    // Act
    notice.copied('abc')
    const during = {
      width: element.style.minWidth,
      height: element.style.minHeight,
      over: element.querySelector('.notice-over')?.textContent,
    }
    vi.advanceTimersByTime(2000)

    // Assert
    expect(during).toEqual({ width: `${ICON}px`, height: '30px', over: 'Copied3 characters' })
    expect(element.style.minWidth).toBe('')
    expect(element.style.minHeight).toBe('')
    expect([...element.childNodes]).toEqual([icon])
  })

  it('should end the strip where the full form would while a copy shows over the compact form', () => {
    // Arrange
    vi.useFakeTimers()
    const { notice, text, icon, strip } = compactSetup(300)
    notice.setLasting([text], [icon])

    // Act
    notice.copied('abc')
    const during = {
      covered: strip.dataset.covered,
      width: strip.style.getPropertyValue('--covered'),
    }
    vi.advanceTimersByTime(2000)

    // Assert: the strip hides what the full form takes beyond the icon, then shows it all again
    expect(during).toEqual({ covered: '', width: `${FULL - ICON}px` })
    expect(strip.dataset.covered).toBeUndefined()
    expect(strip.style.getPropertyValue('--covered')).toBe('')
  })

  it('should leave the strip whole when a copy shows over the full form', () => {
    // Arrange
    vi.useFakeTimers()
    const { notice, text, icon, strip } = compactSetup(MIN_STRIP_PX)
    notice.setLasting([text], [icon])

    // Act
    notice.copied('abc')

    // Assert
    expect(strip.dataset.covered).toBeUndefined()
  })

  it('should stay full when the notice has no compact form', () => {
    // Arrange
    const { element, notice, text } = compactSetup(100)

    // Act
    notice.setLasting([text])

    // Assert
    expect(element.classList.contains('compact')).toBe(false)
    expect([...element.childNodes]).toEqual([text])
  })
})
