// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { fitHead } from './head-fit.ts'

// happy-dom has no layout: the row is 500 pixels wide and each step taken saves 60 of its overflow
function header(width: number) {
  const head = document.createElement('div')
  const scope = document.createElement('span')
  head.append(scope)
  let content = width
  const taken = () => ['shortTally', 'shortSend', 'cutScope'].filter((step) => step in head.dataset)
  Object.defineProperty(head, 'clientWidth', { get: () => 500 })
  Object.defineProperty(head, 'scrollWidth', {
    get: () => Math.max(500, content - 60 * taken().length),
  })
  const resize = (next: number) => {
    content = next
  }
  return { head, scope, taken, resize }
}

describe('fitHead', () => {
  it('should take no step when the row fits', () => {
    const { head, scope, taken } = header(480)

    fitHead(head, scope)

    expect(taken()).toEqual([])
  })

  it('should shorten the count, then the send button, and stop once the row fits', () => {
    const { head, scope, taken } = header(600)

    fitHead(head, scope)

    expect(taken()).toEqual(['shortTally', 'shortSend'])
  })

  it('should cut the scope label only after the other steps', () => {
    const { head, scope, taken } = header(700)

    fitHead(head, scope)

    expect(taken()).toEqual(['shortTally', 'shortSend', 'cutScope'])
  })

  it('should undo the steps when the row has room again', () => {
    const { head, scope, taken, resize } = header(700)
    fitHead(head, scope)
    resize(480)

    fitHead(head, scope)

    expect(taken()).toEqual([])
  })
})
