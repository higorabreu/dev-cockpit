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

  describe('mouse trigger', () => {
    it('should open and stay open when the button is released before the threshold', () => {
      const { gesture, scheduler, opened } = setup()
      gesture.press()
      scheduler.advance(10)

      const outcome = gesture.releaseButton()
      scheduler.advance(500)

      expect(outcome).toBe('stay')
      expect(opened()).toBe(1)
      expect(gesture.isOpen()).toBe(true)
      expect(gesture.isSticky()).toBe(true)
      expect(gesture.isHeld()).toBe(false)
    })

    it('should run the selected row when the button is released after the menu opened while held', () => {
      const { gesture, scheduler, opened } = setup()
      gesture.press()
      scheduler.advance(180)

      const outcome = gesture.releaseButton()

      expect(outcome).toBe('run')
      expect(opened()).toBe(1)
      expect(gesture.isOpen()).toBe(false)
      expect(gesture.isSticky()).toBe(false)
    })

    it('should close without opening when another click came while the button was down', () => {
      const { gesture, scheduler, opened } = setup()
      gesture.press()
      gesture.otherKey()

      const outcome = gesture.releaseButton()
      scheduler.advance(500)

      expect(outcome).toBe('close')
      expect(opened()).toBe(0)
      expect(gesture.isSticky()).toBe(false)
    })

    it('should close the menu that stayed open when the button is clicked again', () => {
      const { gesture, scheduler, opened } = setup()
      gesture.press()
      gesture.releaseButton()

      const held = gesture.press()
      scheduler.advance(500)
      const outcome = gesture.releaseButton()

      expect(held).toBe(false)
      expect(outcome).toBe('close')
      expect(opened()).toBe(1)
      expect(gesture.isOpen()).toBe(false)
      expect(gesture.isSticky()).toBe(false)
    })

    it('should give the arrows to the menu when it stayed open after a click', () => {
      const { gesture } = setup()
      gesture.press()
      gesture.releaseButton()

      expect(gesture.arrow()).toBe(true)
    })

    it('should keep the menu open when a key other than the trigger comes while it stayed open', () => {
      const { gesture } = setup()
      gesture.press()
      gesture.releaseButton()

      gesture.otherKey()

      expect(gesture.isOpen()).toBe(true)
      expect(gesture.isSticky()).toBe(true)
    })

    it('should forget the menu that stayed open when cancelled', () => {
      const { gesture } = setup()
      gesture.press()
      gesture.releaseButton()

      gesture.cancel()

      expect(gesture.isOpen()).toBe(false)
      expect(gesture.isSticky()).toBe(false)
      expect(gesture.arrow()).toBe(false)
    })
  })

  it('should drop the menu when a key trigger is released before the threshold, as before', () => {
    const { gesture, scheduler, opened } = setup()
    gesture.press()
    scheduler.advance(10)

    const wasOpen = gesture.release()
    scheduler.advance(500)

    expect(wasOpen).toBe(false)
    expect(opened()).toBe(0)
    expect(gesture.isSticky()).toBe(false)
  })
})
