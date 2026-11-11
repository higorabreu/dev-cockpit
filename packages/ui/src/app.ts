import {
  activateTab,
  activateTabAt,
  closeOtherTabs,
  closeTab,
  emptyTabs,
  type HostApi,
  openTab,
  reorderTabs,
  stepTab,
  type TabsState,
} from '@dck/core'
import type { ThemeName } from '@dck/design'
import { setFullHeight } from './layout-mode.ts'
import { createNotice } from './notice.ts'
import { bindShortcuts } from './shortcuts.ts'
import { createTabBar } from './tab-bar.ts'
import { createTabMenu } from './tab-menu.ts'
import { createTerminalSession, type TerminalSession } from './terminal-session.ts'
import { applyTheme } from './theme.ts'

export interface AppElements {
  readonly bar: HTMLElement
  readonly host: HTMLElement
  readonly notice: HTMLElement
  readonly menu: HTMLElement
}

export async function startApp(elements: AppElements, api: HostApi, initialTheme: ThemeName) {
  const { bar, host } = elements
  const sessions = new Map<string, TerminalSession>()
  const notice = createNotice(elements.notice, bar)
  const menu = createTabMenu(elements.menu)
  let state: TabsState = emptyTabs
  let theme = initialTheme
  let counter = 0

  function render() {
    tabBar.render(state)
    for (const [id, session] of sessions)
      session.element.classList.toggle('active', id === state.activeId)
    const active = state.activeId ? sessions.get(state.activeId) : undefined
    active?.fit()
    active?.focus()
  }

  function update(next: TabsState) {
    if (next === state) return
    state = next
    render()
  }

  function discard(id: string) {
    sessions.get(id)?.dispose()
    sessions.delete(id)
  }

  function close(id: string) {
    const next = closeTab(state, id)
    if (next === state) return
    discard(id)
    update(next)
  }

  function closeOthers(id: string) {
    for (const tab of state.tabs) if (tab.id !== id) discard(tab.id)
    update(closeOtherTabs(state, id))
  }

  async function open(cwd?: string) {
    counter += 1
    const id = `tab-${counter}`
    const session = await createTerminalSession({
      host,
      api,
      theme,
      ...(cwd ? { cwd } : {}),
      onCopied: (text) => notice.copied(text),
      onExit: () => close(id),
    })
    sessions.set(id, session)
    update(openTab(state, { id, label: `shell ${counter}` }))
  }

  const tabBar = createTabBar(bar, {
    activate: (id) => update(activateTab(state, id)),
    reorder: (ids) => {
      state = reorderTabs(state, ids)
      render()
    },
    contextMenu(id, x, y) {
      const several = state.tabs.length > 1
      menu.open(
        [
          { label: 'Fechar aba', enabled: several, run: () => close(id) },
          { label: 'Fechar as outras', enabled: several, run: () => closeOthers(id) },
          { label: 'Duplicar aba', enabled: true, run: () => void open() },
        ],
        x,
        y,
        !document.body.classList.contains('full'),
      )
    },
  })

  bindShortcuts({
    newTab: () => void open(),
    closeTab: () => state.activeId && close(state.activeId),
    nextTab: () => update(stepTab(state, 1)),
    previousTab: () => update(stepTab(state, -1)),
    goToTab: (index) => update(activateTabAt(state, index)),
    toggleTheme() {
      theme = theme === 'dark' ? 'light' : 'dark'
      applyTheme(theme)
      for (const session of sessions.values()) session.setTheme(theme)
    },
  })

  api.window.onFullHeightChange((full) => setFullHeight(full, [bar, host]))
  api.window.onShown(() => {
    document.body.classList.remove('enter')
    void document.body.offsetWidth
    document.body.classList.add('enter')
  })

  await open()
}
