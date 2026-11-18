// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createResizeEdge } from './resize-edge.ts'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(answer: (height: number) => number | undefined = (height) => height / 1000) {
  document.body.replaceChildren()
  const edge = document.createElement('div')
  const label = document.createElement('div')
  label.hidden = true
  document.body.append(edge, label)
  // happy-dom has no pointer capture; the edge only needs to keep the pointer
  let captured: number | undefined
  edge.setPointerCapture = (id) => {
    captured = id
  }
  edge.releasePointerCapture = () => {
    captured = undefined
  }
  edge.hasPointerCapture = (id) => captured === id
  const asked: number[] = []
  const ends: boolean[] = []
  const holds: boolean[] = []
  let settles = 0
  let fullHeights = 0
  const control = createResizeEdge({
    edge,
    label,
    resize: async (height) => {
      asked.push(height)
      return answer(height)
    },
    end: (keep) => void ends.push(keep),
    toggleFullHeight: () => {
      fullHeights += 1
    },
    hold: (held) => void holds.push(held),
    settle: () => {
      settles += 1
    },
  })
  const pointer = (type: string, clientY: number) =>
    edge.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientY, button: 0, bubbles: true }))
  return {
    edge,
    label,
    control,
    pointer,
    asked,
    ends,
    holds,
    settles: () => settles,
    fullHeights: () => fullHeights,
  }
}

describe('createResizeEdge', () => {
  it('should ask for the height under the pointer and show it in percent while dragging', async () => {
    // Arrange
    const { pointer, asked, label, holds } = setup()
    const bottom = window.innerHeight

    // Act
    pointer('pointerdown', bottom - 2)
    pointer('pointermove', bottom - 102)
    await settle()

    // Assert
    expect(asked).toEqual([bottom - 100])
    expect(label.hidden).toBe(false)
    expect(label.textContent).toBe(`${Math.round(((bottom - 100) / 1000) * 100)}%`)
    expect(holds).toEqual([true])
  })

  it('should keep the height, let the terminals fit and hide the percent when the pointer is released', async () => {
    // Arrange
    const { pointer, ends, holds, label, settles } = setup()
    pointer('pointerdown', 500)
    pointer('pointermove', 450)
    await settle()

    // Act
    pointer('pointerup', 450)

    // Assert
    expect(ends).toEqual([true])
    expect(holds).toEqual([true, false])
    expect(settles()).toBe(1)
    expect(label.hidden).toBe(true)
  })

  it('should put the window back when Esc is pressed while dragging', async () => {
    // Arrange
    const { pointer, ends } = setup()
    pointer('pointerdown', 500)
    pointer('pointermove', 400)
    await settle()

    // Act
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    pointer('pointerup', 400)

    // Assert
    expect(ends).toEqual([false])
  })

  it('should treat a press that barely moves as a click and resize nothing', () => {
    // Arrange
    const { pointer, asked, ends } = setup()

    // Act
    pointer('pointerdown', 500)
    pointer('pointermove', 501)
    pointer('pointerup', 501)

    // Assert
    expect(asked).toEqual([])
    expect(ends).toEqual([])
  })

  it('should toggle full height when the edge is double clicked', () => {
    // Arrange
    const { edge, fullHeights } = setup()

    // Act
    edge.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    // Assert
    expect(fullHeights()).toBe(1)
  })

  it('should stop the drag and save nothing when the host refuses the height', async () => {
    // Arrange
    const { pointer, ends, label } = setup(() => undefined)

    // Act
    pointer('pointerdown', 500)
    pointer('pointermove', 400)
    await settle()

    // Assert
    expect(ends).toEqual([false])
    expect(label.hidden).toBe(true)
  })

  it('should hide the edge when the height is locked', () => {
    // Arrange
    const { edge, control } = setup()

    // Act
    control.setEnabled(false)

    // Assert
    expect(edge.hidden).toBe(true)
  })
})
