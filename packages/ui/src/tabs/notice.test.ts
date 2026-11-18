// @vitest-environment happy-dom
import { createTranslator } from '@dck/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotice } from './notice.ts'

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
