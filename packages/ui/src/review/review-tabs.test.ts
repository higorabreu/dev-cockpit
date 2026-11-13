// @vitest-environment happy-dom
import { type AgentState, createTranslator, type HostApi, ok, reviewDiff } from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createTabView } from '../panes/tab-view.ts'
import { AGENT_SETTLE_MS } from './review-refresh.ts'
import { createReviewTabs } from './review-tabs.ts'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const settle = () => new Promise((resolve) => setTimeout(resolve, AGENT_SETTLE_MS + 20))

function setup(width = 1201, height = 700) {
  let reads = 0
  let agent: AgentState | undefined
  const api = {
    review: {
      diff: async () => {
        reads += 1
        return ok({
          kind: 'ok' as const,
          diff: reviewDiff('/home/ana/acme', 'uncommitted', 'main', []),
        })
      },
      fileLines: async () => ok([]),
    },
  } as unknown as HostApi
  const host = document.createElement('div')
  document.body.append(host)
  const view = createTabView(host, {
    t: createTranslator('en').t,
    preferences: () => ({ preference: 'side', ratios: { side: 0.5, stacked: 0.5 } }),
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
    modifier: 'Ctrl',
    isModified: () => false,
    view: () => view,
    cwd: async () => '/home/ana/acme',
    agent: () => agent,
  })
  return {
    reviews,
    view,
    terminal,
    reads: () => reads,
    setAgent: (state: AgentState | undefined) => {
      agent = state
    },
  }
}

afterEach(() => {
  document.body.replaceChildren()
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
})
