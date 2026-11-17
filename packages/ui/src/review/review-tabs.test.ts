// @vitest-environment happy-dom
import {
  type AgentState,
  createTranslator,
  type HostApi,
  noBranchInfo,
  type Orientation,
  ok,
  parseUnifiedDiff,
  reviewDiff,
} from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createTabView } from '../panes/tab-view.ts'
import { createKeymap } from '../platform/keymap.ts'
import { AGENT_SETTLE_MS } from './review-refresh.ts'
import { createReviewTabs } from './review-tabs.ts'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const settle = () => new Promise((resolve) => setTimeout(resolve, AGENT_SETTLE_MS + 20))

const invoice = [
  'diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts',
  '--- a/src/billing/invoice.ts',
  '+++ b/src/billing/invoice.ts',
  '@@ -10,2 +10,2 @@',
  ' const base = 1',
  '-const timeout = 3000',
  '+const timeout = 5000',
  '',
].join('\n')

function setup(width = 1201, height = 700, diffText = '', accepts = true) {
  const layouts: Orientation[] = []
  const pasted: string[] = []
  let reads = 0
  let agent: AgentState | undefined
  const api = {
    review: {
      diff: async () => {
        reads += 1
        return ok({
          kind: 'ok' as const,
          diff: reviewDiff(
            '/home/ana/acme',
            'uncommitted',
            noBranchInfo,
            parseUnifiedDiff(diffText),
          ),
        })
      },
      fileLines: async () => ok([]),
      fingerprint: async () => undefined,
      saveNotes: async (root: string) => ok(`${root}/.git/dck/review-20261117-143000.md`),
    },
  } as unknown as HostApi
  const host = document.createElement('div')
  document.body.append(host)
  const view = createTabView(host, {
    t: createTranslator('en').t,
    preferences: () => ({ preference: 'side', ratios: { side: 0.5, stacked: 0.5 } }),
    onArrange: (orientation, narrow) => reviews.arranged('tab-1', orientation, narrow),
  })
  Object.defineProperty(view.element, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(view.element, 'clientHeight', { value: height, configurable: true })
  const terminal = document.createElement('div')
  terminal.tabIndex = 0
  view.element.append(terminal)
  view.setTerminal({
    id: 'tab-1',
    kind: 'terminal',
    element: terminal,
    focus: () => terminal.focus(),
  })
  const reviews = createReviewTabs({
    api,
    i18n: createTranslator('en'),
    keymap: createKeymap('pc'),
    view: () => view,
    cwd: async () => '/home/ana/acme',
    agent: () => agent,
    chooseLayout: (orientation) => layouts.push(orientation),
    baseFor: () => undefined,
    chooseBase: async () => undefined,
    paste: (tabId, text) => {
      if (!accepts) return false
      pasted.push(`${tabId}|${text}`)
      return true
    },
  })
  return {
    reviews,
    view,
    terminal,
    pasted,
    reads: () => reads,
    layouts,
    setAgent: (state: AgentState | undefined) => {
      agent = state
    },
  }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('createReviewTabs send', () => {
  it('should type the line naming the comments file into the tab terminal and give it the keys when sent', async () => {
    // Arrange
    const { reviews, terminal, pasted } = setup(1201, 700, invoice)
    reviews.toggle('tab-1')
    await flush()
    const lines = document.querySelector('.rv-lines') as HTMLElement
    lines.focus()
    const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
    press(lines, 'n')
    press(lines, 'ArrowDown')
    press(lines, 'ArrowDown')
    press(lines, 'ArrowDown')
    press(lines, 'c')
    const field = document.querySelector('.rv-field') as HTMLTextAreaElement
    field.value = 'use the constant from config'
    press(field, 'Enter', { ctrlKey: true })

    // Act
    await reviews.send('tab-1')

    // Assert
    expect(pasted).toEqual([
      'tab-1|Address the review comments in .git/dck/review-20261117-143000.md',
    ])
    expect(document.activeElement).toBe(terminal)
    expect(document.querySelector('.rv-send')?.hasAttribute('hidden')).toBe(true)
  })

  it('should keep the comments pending and say why when the terminal refuses the line', async () => {
    // Arrange
    const { reviews, terminal, pasted } = setup(1201, 700, invoice, false)
    reviews.toggle('tab-1')
    await flush()
    const lines = document.querySelector('.rv-lines') as HTMLElement
    lines.focus()
    const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
    press(lines, 'n')
    press(lines, 'ArrowDown')
    press(lines, 'ArrowDown')
    press(lines, 'ArrowDown')
    press(lines, 'c')
    const field = document.querySelector('.rv-field') as HTMLTextAreaElement
    field.value = 'use the constant from config'
    press(field, 'Enter', { ctrlKey: true })

    // Act
    await reviews.send('tab-1')

    // Assert
    expect(pasted).toEqual([])
    expect(document.activeElement).not.toBe(terminal)
    expect(document.querySelector('.rv-send-count')?.textContent).toBe('1')
    expect(document.querySelector('.rv-status')?.textContent).toBe(
      'The terminal did not take the line, so the comments stay pending',
    )
  })

  it('should paste nothing when no comment is pending', async () => {
    const { reviews, pasted } = setup(1201, 700, invoice)
    reviews.toggle('tab-1')
    await flush()

    await reviews.send('tab-1')

    expect(pasted).toEqual([])
  })
})

describe('createReviewTabs', () => {
  it('should open the review beside the terminal and close it with the same toggle', async () => {
    const { reviews, view } = setup()

    reviews.toggle('tab-1')
    await flush()
    const opened = view.element.querySelector('.review') !== null
    reviews.toggle('tab-1')

    expect(opened).toBe(true)
    expect(view.element.querySelector('.review')).toBeNull()
    expect(reviews.isOpen('tab-1')).toBe(false)
  })

  it('should bring a hidden review back instead of closing it when the tab is narrow', async () => {
    const { reviews, view } = setup(700)
    reviews.toggle('tab-1')
    await flush()
    view.focus('tab-1')

    reviews.toggle('tab-1')

    expect(reviews.isOpen('tab-1')).toBe(true)
    expect(view.isShown('tab-1:review')).toBe(true)
  })

  it('should read again when the agent changes state only while the review is open', async () => {
    const { reviews, reads, setAgent } = setup()
    setAgent('working')
    reviews.syncAgents()
    reviews.toggle('tab-1')
    await flush()

    setAgent('your-turn')
    reviews.syncAgents()
    await settle()
    const whileOpen = reads()
    reviews.toggle('tab-1')
    setAgent('working')
    reviews.syncAgents()
    await settle()

    expect(whileOpen).toBe(2)
    expect(reads()).toBe(2)
  })

  it('should give the keys back to the terminal when Esc is pressed in the review', async () => {
    const { reviews, view, terminal } = setup()
    reviews.toggle('tab-1')
    await flush()

    view.element
      .querySelector('.review')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(document.activeElement).toBe(terminal)
    expect(reviews.isOpen('tab-1')).toBe(true)
  })

  it('should give the review the keys from the terminal and close it only from the review', async () => {
    const { reviews, terminal } = setup()
    reviews.toggle('tab-1')
    await flush()
    terminal.focus()

    reviews.toggle('tab-1')
    const focusedReview = document.activeElement?.closest('.review') !== null
    reviews.toggle('tab-1')

    expect(focusedReview).toBe(true)
    expect(reviews.isOpen('tab-1')).toBe(false)
  })

  it('should reopen the same review in the tab so its reading is kept', async () => {
    const { reviews, view } = setup()
    reviews.toggle('tab-1')
    await flush()
    const first = view.element.querySelector('.review')
    reviews.close('tab-1')

    reviews.toggle('tab-1')

    expect(view.element.querySelector('.review')).toBe(first)
  })

  it('should choose the other orientation from the header button and ignore it in a narrow tab', async () => {
    const wide = setup()
    wide.reviews.toggle('tab-1')
    await flush()
    wide.view.element.querySelector<HTMLButtonElement>('[data-tip-key="Ctrl+Shift+E"]')?.click()
    document.body.replaceChildren()
    const narrow = setup(700)
    narrow.reviews.toggle('tab-1')
    await flush()

    narrow.reviews.toggleLayout('tab-1')

    expect(wide.layouts).toEqual(['stacked'])
    expect(narrow.layouts).toEqual([])
  })
})
