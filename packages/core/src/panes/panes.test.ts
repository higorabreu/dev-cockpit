import { describe, expect, it } from 'vitest'
import {
  addPane,
  arrangePanes,
  chooseOrientation,
  focusPane,
  MIN_STACKED_ROWS,
  PANE_MIN_WIDTH,
  PANE_RATIO,
  type PaneLayout,
  paneOfKind,
  removePane,
  setPaneRatio,
  singlePane,
  type TabShape,
} from './panes.ts'

const terminal = { id: 'tab-1', kind: 'terminal' } as const
const review = { id: 'tab-1:review', kind: 'review' } as const
const split = (): PaneLayout => addPane(singlePane(terminal), review)

// A 16px terminal font (9.6 by 19) with its padding and scrollbar, and the review's 12px diff with its
// gutters, header and hints
const grids = {
  terminal: { cellWidth: 9.6, cellHeight: 19, frameWidth: 24, frameHeight: 16 },
  review: { cellWidth: 7.2, cellHeight: 20, frameWidth: 122, frameHeight: 72 },
} as const
const shape = (width: number, height: number): TabShape => ({ width, height, divider: 1, grids })
const kinds = ['terminal', 'review'] as const

describe('singlePane', () => {
  it('should hold only the terminal with the focus when a tab opens', () => {
    const layout = singlePane(terminal)

    expect(layout.panes).toEqual([terminal])
    expect(layout.focused).toBe('tab-1')
    expect(layout.ratios).toEqual({ side: PANE_RATIO.initial, stacked: PANE_RATIO.initial })
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
    const layout = removePane(setPaneRatio(split(), 'side', 0.6), 'tab-1:review')

    expect(layout.ratios.side).toBe(0.6)
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
    expect(setPaneRatio(split(), 'side', 0.05).ratios.side).toBe(PANE_RATIO.min)
    expect(setPaneRatio(split(), 'stacked', 0.99).ratios.stacked).toBe(PANE_RATIO.max)
  })

  it('should keep the share of the other orientation when one changes', () => {
    const layout = setPaneRatio(split(), 'stacked', 0.3)

    expect(layout.ratios).toEqual({ side: PANE_RATIO.initial, stacked: 0.3 })
  })

  it('should keep the layout when the ratio is not a number', () => {
    const layout = split()

    expect(setPaneRatio(layout, 'side', Number.NaN)).toBe(layout)
  })
})

describe('chooseOrientation', () => {
  it('should stack the review below the terminal when a 1400px tab cannot give each side 100 columns', () => {
    expect(chooseOrientation('auto', kinds, shape(1400, 720))).toBe('stacked')
  })

  it('should put the panes side by side when a 1920px tab gives each side 100 columns', () => {
    expect(chooseOrientation('auto', kinds, shape(1920, 1000))).toBe('side')
  })

  it('should follow the real cell width when a smaller terminal font fits 100 columns', () => {
    const small = { ...grids, terminal: { ...grids.terminal, cellWidth: 7.8 } }

    expect(chooseOrientation('auto', kinds, { ...shape(1700, 720), grids: small })).toBe('side')
    expect(chooseOrientation('auto', kinds, shape(1700, 720))).toBe('stacked')
  })

  it('should leave the tab to one pane when neither orientation fits', () => {
    expect(chooseOrientation('auto', kinds, shape(900, 560))).toBeUndefined()
  })

  it('should stack only when each pane keeps 15 rows', () => {
    const terminalRows = grids.terminal.frameHeight + MIN_STACKED_ROWS * grids.terminal.cellHeight
    const reviewRows = grids.review.frameHeight + MIN_STACKED_ROWS * grids.review.cellHeight
    const enough = terminalRows + reviewRows + 1

    expect(chooseOrientation('auto', kinds, shape(1400, enough))).toBe('stacked')
    expect(chooseOrientation('auto', kinds, shape(1400, enough - 1))).toBeUndefined()
  })

  it('should keep a chosen orientation while it fits its minimums when auto would pick another', () => {
    expect(chooseOrientation('side', kinds, shape(1400, 720))).toBe('side')
    expect(chooseOrientation('stacked', kinds, shape(1920, 1000))).toBe('stacked')
  })

  it('should fall back to one pane when the chosen orientation cannot fit its minimums', () => {
    const sideMinimum = PANE_MIN_WIDTH.terminal + PANE_MIN_WIDTH.review + 1
    const narrow = PANE_MIN_WIDTH.review - 1

    expect(chooseOrientation('side', kinds, shape(sideMinimum - 1, 1000))).toBeUndefined()
    expect(chooseOrientation('side', kinds, shape(sideMinimum, 1000))).toBe('side')
    expect(chooseOrientation('stacked', kinds, shape(1400, 560))).toBeUndefined()
    expect(chooseOrientation('stacked', kinds, shape(narrow, 1000))).toBeUndefined()
  })
})

describe('arrangePanes', () => {
  it('should give the whole width to the terminal when the tab has one pane', () => {
    expect(arrangePanes(singlePane(terminal), shape(1200, 700), 'auto')).toEqual({
      visible: [{ id: 'tab-1', size: 1200 }],
      orientation: undefined,
      narrow: false,
    })
  })

  it('should split the width by the side ratio when the panes are side by side', () => {
    const arranged = arrangePanes(split(), shape(1201, 700), 'side')

    expect(arranged).toEqual({
      visible: [
        { id: 'tab-1', size: 600 },
        { id: 'tab-1:review', size: 600 },
      ],
      orientation: 'side',
      narrow: false,
    })
  })

  it('should split the height by the stacked ratio when the panes are stacked', () => {
    const layout = setPaneRatio(split(), 'stacked', 0.3)

    const arranged = arrangePanes(layout, shape(1400, 1101), 'auto')

    expect(arranged.orientation).toBe('stacked')
    expect(arranged.visible).toEqual([
      { id: 'tab-1', size: 330 },
      { id: 'tab-1:review', size: 770 },
    ])
  })

  it('should keep each minimum when the ratio would squeeze a pane', () => {
    const side = setPaneRatio(split(), 'side', PANE_RATIO.max)
    const stacked = setPaneRatio(split(), 'stacked', PANE_RATIO.max)
    const reviewRows = grids.review.frameHeight + MIN_STACKED_ROWS * grids.review.cellHeight

    const [, right] = arrangePanes(side, shape(1001, 700), 'side').visible
    const [, bottom] = arrangePanes(stacked, shape(1400, 720), 'stacked').visible

    expect(right?.size).toBe(PANE_MIN_WIDTH.review)
    expect(bottom?.size).toBe(reviewRows)
  })

  it('should show only the focused pane when no orientation fits', () => {
    const onReview = arrangePanes(split(), shape(900, 560), 'auto')
    const onTerminal = arrangePanes(focusPane(split(), 'tab-1'), shape(900, 560), 'auto')

    expect(onReview).toEqual({
      visible: [{ id: 'tab-1:review', size: 900 }],
      orientation: undefined,
      narrow: true,
    })
    expect(onTerminal.visible).toEqual([{ id: 'tab-1', size: 900 }])
  })
})
