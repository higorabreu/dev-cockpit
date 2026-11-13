import { describe, expect, it } from 'vitest'
import {
  addPane,
  arrangePanes,
  focusPane,
  PANE_MIN_WIDTH,
  PANE_RATIO,
  type PaneLayout,
  paneOfKind,
  removePane,
  setPaneRatio,
  singlePane,
} from './panes.ts'

const terminal = { id: 'tab-1', kind: 'terminal' } as const
const review = { id: 'tab-1:review', kind: 'review' } as const
const split = (): PaneLayout => addPane(singlePane(terminal), review)

describe('singlePane', () => {
  it('should hold only the terminal with the focus when a tab opens', () => {
    const layout = singlePane(terminal)

    expect(layout.panes).toEqual([terminal])
    expect(layout.focused).toBe('tab-1')
    expect(layout.ratio).toBe(PANE_RATIO.initial)
  })
})

describe('addPane', () => {
  it('should put the new pane on the right and focus it when the tab has one pane', () => {
    const layout = split()

    expect(layout.panes.map((pane) => pane.id)).toEqual(['tab-1', 'tab-1:review'])
    expect(layout.focused).toBe('tab-1:review')
  })

  it('should only move the focus when the pane is already there', () => {
    const layout = focusPane(split(), 'tab-1')

    const again = addPane(layout, review)

    expect(again.panes).toHaveLength(2)
    expect(again.focused).toBe('tab-1:review')
  })

  it('should keep the layout when the tab already has the most panes', () => {
    const layout = split()

    expect(addPane(layout, { id: 'tab-1:other', kind: 'terminal' })).toBe(layout)
  })
})

describe('removePane', () => {
  it('should give the focus back to the terminal when the focused review closes', () => {
    const layout = removePane(split(), 'tab-1:review')

    expect(layout.panes).toEqual([terminal])
    expect(layout.focused).toBe('tab-1')
  })

  it('should keep the first pane when asked to remove it', () => {
    const layout = split()

    expect(removePane(layout, 'tab-1')).toBe(layout)
  })

  it('should keep the ratio when a pane closes so the next split opens the same way', () => {
    const layout = removePane(setPaneRatio(split(), 0.6), 'tab-1:review')

    expect(layout.ratio).toBe(0.6)
  })
})

describe('focusPane', () => {
  it('should keep the layout when the pane does not exist', () => {
    const layout = split()

    expect(focusPane(layout, 'tab-9')).toBe(layout)
  })
})

describe('paneOfKind', () => {
  it('should find the review when the tab is split', () => {
    expect(paneOfKind(split(), 'review')).toEqual(review)
    expect(paneOfKind(singlePane(terminal), 'review')).toBeUndefined()
  })
})

describe('setPaneRatio', () => {
  it('should clamp the share when it goes past the limits', () => {
    expect(setPaneRatio(split(), 0.05).ratio).toBe(PANE_RATIO.min)
    expect(setPaneRatio(split(), 0.99).ratio).toBe(PANE_RATIO.max)
  })

  it('should keep the layout when the ratio is not a number', () => {
    const layout = split()

    expect(setPaneRatio(layout, Number.NaN)).toBe(layout)
  })
})

describe('arrangePanes', () => {
  it('should give the whole width to the terminal when the tab has one pane', () => {
    expect(arrangePanes(singlePane(terminal), 1200, 1)).toEqual({
      visible: [{ id: 'tab-1', width: 1200 }],
      narrow: false,
    })
  })

  it('should split the width by the ratio when both panes fit', () => {
    const arranged = arrangePanes(split(), 1201, 1)

    expect(arranged).toEqual({
      visible: [
        { id: 'tab-1', width: 600 },
        { id: 'tab-1:review', width: 600 },
      ],
      narrow: false,
    })
  })

  it('should keep each minimum width when the ratio would squeeze a pane', () => {
    const layout = setPaneRatio(split(), PANE_RATIO.max)

    const [, right] = arrangePanes(layout, 1001, 1).visible

    expect(right?.width).toBe(PANE_MIN_WIDTH.review)
  })

  it('should show only the focused pane when both minimums do not fit', () => {
    const narrowWidth = PANE_MIN_WIDTH.terminal + PANE_MIN_WIDTH.review

    const onReview = arrangePanes(split(), narrowWidth, 1)
    const onTerminal = arrangePanes(focusPane(split(), 'tab-1'), narrowWidth, 1)

    expect(onReview).toEqual({
      visible: [{ id: 'tab-1:review', width: narrowWidth }],
      narrow: true,
    })
    expect(onTerminal.visible).toEqual([{ id: 'tab-1', width: narrowWidth }])
  })
})
