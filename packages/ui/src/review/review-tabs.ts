import type { AgentState, HostApi, Orientation, Translator } from '@dck/core'
import type { TabView } from '../panes/tab-view.ts'
import { createReviewPane, type ReviewMemory, type ReviewPane } from './review-pane.ts'

export interface ReviewTabsDeps {
  readonly api: HostApi
  readonly i18n: Translator
  readonly modifier: string
  isModified(event: MouseEvent): boolean
  view(tabId: string): TabView | undefined
  // The tab's folder right now
  cwd(tabId: string): Promise<string | undefined>
  agent(tabId: string): AgentState | undefined
  // The header's layout button: show the review in this orientation from now on
  chooseLayout(orientation: Orientation): void
}

const paneId = (tabId: string) => `${tabId}:review`

// The review pane of each tab: opened beside or below the terminal, closed with the same key, and
// reading the diff only while it is open
export function createReviewTabs(deps: ReviewTabsDeps) {
  const panes = new Map<string, ReviewPane>()
  const memory: ReviewMemory = { indexHidden: false }

  function create(tabId: string, view: TabView): ReviewPane {
    return createReviewPane({
      id: `review-${tabId}`,
      api: deps.api,
      i18n: deps.i18n,
      memory,
      modifier: deps.modifier,
      isModified: deps.isModified,
      cwd: () => deps.cwd(tabId),
      onEscape: () => view.focus(tabId),
      onClose: () => close(tabId),
      onToggleLayout: () => toggleLayout(tabId),
    })
  }

  function open(tabId: string) {
    const view = deps.view(tabId)
    if (!view) return
    const pane = create(tabId, view)
    panes.set(tabId, pane)
    pane.agentState(deps.agent(tabId))
    view.open({
      id: paneId(tabId),
      kind: 'review',
      element: pane.element,
      focus: () => pane.focus(),
      grid: () => pane.grid(),
    })
    pane.setArrangement(view.orientation(), view.isNarrow())
    pane.open()
  }

  function close(tabId: string) {
    const pane = panes.get(tabId)
    if (!pane) return
    pane.close()
    panes.delete(tabId)
    deps.view(tabId)?.close(paneId(tabId))
  }

  // Side by side becomes stacked and the other way round; nothing to switch while the review is alone
  function toggleLayout(tabId: string) {
    const orientation = deps.view(tabId)?.orientation()
    if (!panes.has(tabId) || orientation === undefined) return
    deps.chooseLayout(orientation === 'side' ? 'stacked' : 'side')
  }

  return {
    isOpen: (tabId: string) => panes.has(tabId),
    // Opens and focuses the review; closes it when it is on screen; in a narrow tab where the terminal
    // is showing, brings the review back instead of closing what cannot be seen
    toggle(tabId: string) {
      const view = deps.view(tabId)
      if (!view) return
      if (!panes.has(tabId)) return open(tabId)
      if (view.isShown(paneId(tabId))) close(tabId)
      else view.focus(paneId(tabId))
    },
    close,
    toggleLayout,
    arranged(tabId: string, orientation: Orientation | undefined, narrow: boolean) {
      panes.get(tabId)?.setArrangement(orientation, narrow)
    },
    // After any agent signal or settle: each open review reads again when its agent's state moved
    syncAgents() {
      for (const [tabId, pane] of panes) pane.agentState(deps.agent(tabId))
    },
    forget(tabId: string) {
      panes.get(tabId)?.close()
      panes.delete(tabId)
    },
    retranslate() {
      for (const pane of panes.values()) pane.retranslate()
    },
  }
}
