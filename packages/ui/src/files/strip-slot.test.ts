// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createStripSlot } from './strip-slot.ts'

function setup(hidden = false) {
  document.body.replaceChildren()
  const view = document.createElement('section')
  view.hidden = hidden
  document.body.append(view)
  const slot = createStripSlot(view)
  view.append(slot.element)
  const strip = (text: string) => {
    const element = document.createElement('div')
    element.className = 'fv-strip'
    element.textContent = text
    return element
  }
  const folds = () => [...slot.element.querySelectorAll<HTMLElement>('.fv-strip-fold')]
  const settle = (fold: HTMLElement | undefined) => fold?.dispatchEvent(new Event('animationend'))
  return { view, slot, strip, folds, settle }
}

describe('createStripSlot', () => {
  it('should fold the strip open and hold the body while it moves when a strip comes to a shown file', () => {
    // Arrange
    const { view, slot, strip, folds } = setup()

    // Act
    slot.set(strip('This file changed on disk'))

    // Assert
    expect(folds().map((fold) => fold.dataset.fold)).toEqual(['in'])
    expect(view.hasAttribute('data-strip-moving')).toBe(true)
  })

  it('should let the body take its size again when the strip has folded open', () => {
    // Arrange
    const { view, slot, strip, folds, settle } = setup()
    slot.set(strip('This file changed on disk'))

    // Act
    settle(folds()[0])

    // Assert
    expect(folds()[0]?.hasAttribute('data-fold')).toBe(false)
    expect(view.hasAttribute('data-strip-moving')).toBe(false)
  })

  it('should keep a strip that goes inert until it has folded away', () => {
    // Arrange
    const { slot, strip, folds, settle } = setup()
    slot.set(strip('Merged with the disk'))
    settle(folds()[0])

    // Act
    slot.set(undefined)
    const leaving = folds()[0]
    const during = { count: folds().length, fold: leaving?.dataset.fold }
    settle(leaving)

    // Assert
    expect(during).toEqual({ count: 1, fold: 'out' })
    expect(leaving?.inert).toBe(true)
    expect(leaving?.getAttribute('aria-hidden')).toBe('true')
    expect(folds()).toHaveLength(0)
  })

  it('should change the words in place without folding when a strip already shows', () => {
    // Arrange
    const { slot, strip, folds, settle } = setup()
    slot.set(strip('This file changed on disk'))
    settle(folds()[0])

    // Act
    slot.set(strip('Merged with the disk'))

    // Assert
    expect(folds()).toHaveLength(1)
    expect(folds()[0]?.hasAttribute('data-fold')).toBe(false)
    expect(folds()[0]?.textContent).toBe('Merged with the disk')
  })

  it('should put the strip and take it away at once when the file is not shown', () => {
    // Arrange
    const { view, slot, strip, folds } = setup(true)

    // Act
    slot.set(strip('This file was deleted'))
    const shown = folds().map((fold) => fold.hasAttribute('data-fold'))
    slot.set(undefined)

    // Assert
    expect(shown).toEqual([false])
    expect(folds()).toHaveLength(0)
    expect(view.hasAttribute('data-strip-moving')).toBe(false)
  })

  it('should end the strip that was leaving when a new one comes', () => {
    // Arrange
    const { slot, strip, folds, settle } = setup()
    slot.set(strip('Merged with the disk'))
    settle(folds()[0])
    slot.set(undefined)

    // Act
    slot.set(strip('This file changed on disk'))

    // Assert
    expect(folds().map((fold) => fold.textContent)).toEqual(['This file changed on disk'])
  })
})
