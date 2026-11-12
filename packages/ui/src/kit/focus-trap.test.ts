import { describe, expect, it } from 'vitest'
import { wrapTarget } from './focus-trap.ts'

describe('wrapTarget', () => {
  const controls = ['tab', 'select', 'input', 'close'] as const

  it('should wrap to the first control when Tab is pressed on the last one', () => {
    const target = wrapTarget(controls, 'close', false)

    expect(target).toBe('tab')
  })

  it('should wrap to the last control when Shift+Tab is pressed on the first one', () => {
    const target = wrapTarget(controls, 'tab', true)

    expect(target).toBe('close')
  })

  it('should leave the browser order alone when the focus moves between inner controls', () => {
    const forward = wrapTarget(controls, 'select', false)
    const backward = wrapTarget(controls, 'close', true)

    expect(forward).toBeUndefined()
    expect(backward).toBeUndefined()
  })

  it('should bring the focus back to the first control when it is outside the container', () => {
    const fromOutside = wrapTarget(controls, 'terminal' as (typeof controls)[number], false)
    const fromNowhere = wrapTarget(controls, null, false)

    expect(fromOutside).toBe('tab')
    expect(fromNowhere).toBe('tab')
  })

  it('should bring the focus back to the last control when Shift+Tab starts outside the container', () => {
    const target = wrapTarget(controls, null, true)

    expect(target).toBe('close')
  })

  it('should find no target when the container has no control', () => {
    const target = wrapTarget([], null, false)

    expect(target).toBeUndefined()
  })
})
