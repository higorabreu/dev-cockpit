// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { watchOverflow } from './scrollbar.ts'

// happy-dom lays nothing out, so the list's content and box heights are given
function list(content: number, box: number) {
  const element = document.createElement('div')
  element.className = 'scroll'
  const sizes = { content, box }
  Object.defineProperty(element, 'scrollHeight', { get: () => sizes.content })
  Object.defineProperty(element, 'clientHeight', { get: () => sizes.box })
  document.body.append(element)
  return { element, sizes }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('watchOverflow', () => {
  let stop: (() => void) | undefined
  afterEach(() => {
    stop?.()
    document.body.replaceChildren()
  })

  it('should mark the list when its content is taller than its box', () => {
    const { element } = list(600, 300)

    stop = watchOverflow(element)

    expect(element.hasAttribute('data-overflow')).toBe(true)
  })

  it('should leave the list unmarked when its content fits', () => {
    const { element } = list(300, 300)

    stop = watchOverflow(element)

    expect(element.hasAttribute('data-overflow')).toBe(false)
  })

  it('should follow the rows when they are added or removed', async () => {
    const { element, sizes } = list(200, 300)
    stop = watchOverflow(element)

    sizes.content = 900
    element.append(document.createElement('div'))
    await settle()
    const grown = element.hasAttribute('data-overflow')
    sizes.content = 100
    element.replaceChildren()
    await settle()

    expect(grown).toBe(true)
    expect(element.hasAttribute('data-overflow')).toBe(false)
  })

  it('should stop following the rows when the returned function is called', async () => {
    const { element, sizes } = list(200, 300)
    watchOverflow(element)()

    sizes.content = 900
    element.append(document.createElement('div'))
    await settle()

    expect(element.hasAttribute('data-overflow')).toBe(false)
  })
})
