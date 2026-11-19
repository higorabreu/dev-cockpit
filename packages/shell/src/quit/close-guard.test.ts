import { describe, expect, it } from 'vitest'
import { createCloseGuard } from './close-guard.ts'

const closeEvent = () => {
  const event = {
    prevented: false,
    preventDefault() {
      event.prevented = true
    },
  }
  return event
}

describe('createCloseGuard', () => {
  it('should hold the close and ask for the files to be saved when the last window closes', () => {
    // Arrange
    const requests: string[] = []
    const guard = createCloseGuard(() => void requests.push('request'))
    const event = closeEvent()

    // Act
    guard.close(event)

    // Assert
    expect(event.prevented).toBe(true)
    expect(requests).toEqual(['request'])
  })

  it('should let the window close at once when the app is already quitting', () => {
    const requests: string[] = []
    const guard = createCloseGuard(() => void requests.push('request'))
    const event = closeEvent()

    guard.quitting()
    guard.close(event)

    expect(event.prevented).toBe(false)
    expect(requests).toEqual([])
  })
})
