import { describe, expect, it } from 'vitest'
import { createPointerIntent } from './pointer-intent.ts'

describe('createPointerIntent', () => {
  it('should ignore the pointer when the menu opens under it and it does not move', () => {
    // Arrange
    const intent = createPointerIntent(6)

    // Act
    const moves = [intent.moved(100, 100), intent.moved(100, 100), intent.moved(103, 102)]

    // Assert
    expect(moves).toEqual([false, false, false])
  })

  it('should let the pointer select when it travels past the threshold', () => {
    const intent = createPointerIntent(6)

    intent.moved(100, 100)

    expect(intent.moved(108, 100)).toBe(true)
    expect(intent.moved(109, 100)).toBe(true)
  })

  it('should give the selection back to the keys when a key moves it', () => {
    const intent = createPointerIntent(6)
    intent.moved(100, 100)
    intent.moved(120, 100)

    intent.keysTakeOver()

    expect(intent.moved(120, 100)).toBe(false)
    expect(intent.moved(121, 101)).toBe(false)
    expect(intent.moved(130, 100)).toBe(true)
  })
})
