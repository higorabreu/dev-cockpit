// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { afterFade, transitionMs } from './after-fade.ts'

describe('transitionMs', () => {
  it('should add each delay to its duration and keep the longest when there are several', () => {
    // Arrange
    const style = { transitionDuration: '0.12s, 0s', transitionDelay: '0s, 0.12s' }

    // Act
    const wait = transitionMs(style)

    // Assert
    expect(wait).toBe(120)
  })

  it('should be zero when nothing transitions', () => {
    // Arrange
    const style = { transitionDuration: '0s', transitionDelay: '0s' }

    // Act
    const wait = transitionMs(style)

    // Assert
    expect(wait).toBe(0)
  })
})

describe('afterFade', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should run at once when the element does not fade', () => {
    // Arrange
    const element = document.createElement('div')
    document.body.append(element)
    const run = vi.fn()

    // Act
    afterFade(element, run)

    // Assert
    expect(run).toHaveBeenCalledOnce()
  })

  it('should wait for the fade when the element fades', () => {
    // Arrange
    vi.useFakeTimers()
    const element = document.createElement('div')
    element.style.transitionDuration = '0.12s'
    element.style.transitionDelay = '0s'
    document.body.append(element)
    const run = vi.fn()

    // Act
    afterFade(element, run)
    const early = run.mock.calls.length
    vi.advanceTimersByTime(120)

    // Assert
    expect(early).toBe(0)
    expect(run).toHaveBeenCalledOnce()
  })
})
