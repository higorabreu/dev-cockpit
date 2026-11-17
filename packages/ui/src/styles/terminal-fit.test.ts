import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'panes.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

const bodyOf = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((match) => match[1]?.trim() === selector)?.[2] ??
  ''

// Top and bottom of a rule's `padding` shorthand, in pixels
function verticalPadding(body: string) {
  const values = (body.match(/(?:^|;)\s*padding:\s*([^;]+)/)?.[1] ?? '0')
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseFloat(value) || 0)
  const [top = 0, , bottom = top] = values
  return { top, bottom }
}

// Measured in the window: the tab bar ends at 43px and a row of the default font is 21px tall
const SESSION_TOP = 43
const ROW = 21

// The fit addon divides the computed height of the element xterm opens in (its border box under
// `border-box`) by the row height; `.xterm` itself has no padding to take away
function screenAndContentBottom(windowHeight: number) {
  const session = bodyOf('.session')
  const host = bodyOf('.session-terminal')
  const sessionPadding = verticalPadding(session)
  const hostPadding = verticalPadding(host)
  const hostBox = windowHeight - SESSION_TOP - sessionPadding.top - sessionPadding.bottom
  const seen = /box-sizing:\s*border-box/.test(host)
    ? hostBox
    : hostBox - hostPadding.top - hostPadding.bottom
  const rows = Math.floor(seen / ROW)
  return {
    screen: SESSION_TOP + sessionPadding.top + hostPadding.top + rows * ROW,
    content: windowHeight - sessionPadding.bottom - hostPadding.bottom,
  }
}

// Heights where the session's border box holds one more row than its content box: the old overcount
const tightHeights = Array.from({ length: 700 }, (_, index) => 300 + index).filter(
  (height) => (height - SESSION_TOP) % ROW < 16,
)

describe('terminal fit', () => {
  it('should open xterm in a box with no padding when reading the pane rules', () => {
    expect(bodyOf('.session-terminal')).not.toBe('')
    expect(verticalPadding(bodyOf('.session-terminal'))).toEqual({ top: 0, bottom: 0 })
  })

  it('should keep the pane padding around the terminal when reading the pane rules', () => {
    expect(verticalPadding(bodyOf('.session'))).toEqual({ top: 8, bottom: 8 })
  })

  it('should keep the last row inside the padding when the window height leaves a partial row', () => {
    const cut = tightHeights.filter((height) => {
      const { screen, content } = screenAndContentBottom(height)
      return screen > content
    })

    expect(tightHeights.length).toBeGreaterThan(0)
    expect(cut).toEqual([])
  })
})
