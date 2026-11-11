import { describe, expect, it } from 'vitest'
import { FakeScheduler } from '../testing/fakes.ts'
import { createHoldGesture } from './hold-gesture.ts'

function setup() {
  const scheduler = new FakeScheduler()
  let opened = 0
  const gesture = createHoldGesture({
    scheduler,
    onOpen: () => {
      opened += 1
    },
  })
  return { gesture, scheduler, opened: () => opened }
}

describe('createHoldGesture', () => {
  it('should open the menu when the trigger is held past the threshold', () => {
    const { gesture, scheduler, opened } = setup()

    gesture.press()
    scheduler.advance(179)
    expect(opened()).toBe(0)
    scheduler.advance(1)

    expect(opened()).toBe(1)
    expect(gesture.isOpen()).toBe(true)
  })

  it('should not open the menu when the trigger is released before the threshold', () => {
    const { gesture, scheduler, opened } = setup()

    gesture.press()
    scheduler.advance(100)
    const wasOpen = gesture.release()
    scheduler.advance(200)

    expect(wasOpen).toBe(false)
    expect(opened()).toBe(0)
  })

  it('should not open the menu when another key is pressed before the threshold', () => {
    const { gesture, scheduler, opened } = setup()

    gesture.press()
    gesture.otherKey()
    scheduler.advance(300)

    expect(opened()).toBe(0)
  })

  it('should let an arrow through when it comes before the menu opens', () => {
    const { gesture, scheduler, opened } = setup()

    gesture.press()
    const consumed = gesture.arrow()
    scheduler.advance(300)

    expect(consumed).toBe(false)
    expect(opened()).toBe(0)
  })

  it('should consume arrows when the menu is open', () => {
    const { gesture, scheduler } = setup()
    gesture.press()
    scheduler.advance(180)

    expect(gesture.arrow()).toBe(true)
  })

  it('should not consume arrows when the trigger is not held', () => {
    const { gesture } = setup()

    expect(gesture.arrow()).toBe(false)
  })

  it('should report the menu as open when the trigger is released after opening', () => {
    const { gesture, scheduler } = setup()
    gesture.press()
    scheduler.advance(180)

    expect(gesture.release()).toBe(true)
    expect(gesture.isOpen()).toBe(false)
    expect(gesture.isHeld()).toBe(false)
  })

  it('should open at once when asked while held, without waiting for the threshold', () => {
    const { gesture, opened } = setup()
    gesture.press()

    gesture.openNow()

    expect(opened()).toBe(1)
  })

  it('should ignore a request to open when the trigger is not held', () => {
    const { gesture, opened } = setup()

    gesture.openNow()

    expect(opened()).toBe(0)
  })

  it('should close and forget the hold when cancelled', () => {
    const { gesture, scheduler, opened } = setup()
    gesture.press()
    scheduler.advance(180)

    gesture.cancel()
    scheduler.advance(500)

    expect(gesture.isOpen()).toBe(false)
    expect(opened()).toBe(1)
  })
})
