import type { AgentState, HostApi, Translator } from '@dck/core'
import type { TabView } from '../panes/tab-view.ts'
import { createReviewPane, type ReviewPane } from './review-pane.ts'

export interface ReviewTabsDeps {
  readonly api: HostApi
  readonly i18n: Translator
  readonly modifier: string
  isModified(event: MouseEvent): boolean
  view(tabId: string): TabView | undefined
  // The tab's folder right now
  cwd(tabId: string): Promise<string | undefined>
  agent(tabId: string): AgentState | undefined
}

const paneId = (tabId: string) => `${tabId}:review`

// The review pane of each tab: opened beside the terminal, closed with the same key, and reading the diff
// only while it is open
export function createReviewTabs(deps: ReviewTabsDeps) {
  const panes = new Map<string, ReviewPane>()

  function open(tabId: string) {
    const view = deps.view(tabId)
    if (!view) return
    const pane = createReviewPane({
      id: `review-${tabId}`,
      api: deps.api,
      i18n: deps.i18n,
      modifier: deps.modifier,
      isModified: deps.isModified,
      cwd: () => deps.cwd(tabId),
      onEscape: () => view.focus(tabId),
      onClose: () => close(tabId),
    })
    panes.set(tabId, pane)
    pane.agentState(deps.agent(tabId))
    pane.setNarrow(view.isNarrow())
    view.open({
      id: paneId(tabId),
      kind: 'review',
      element: pane.element,
      focus: () => pane.focus(),
    })
    pane.open()
  }

  function close(tabId: string) {
    const pane = panes.get(tabId)
    if (!pane) return
    pane.close()
    panes.delete(tabId)
    deps.view(tabId)?.close(paneId(tabId))
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
    narrow(tabId: string, narrow: boolean) {
      panes.get(tabId)?.setNarrow(narrow)
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
