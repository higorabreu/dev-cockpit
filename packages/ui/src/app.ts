import {
  activateTab,
  activateTabAt,
  type ComposeStatus,
  closeOtherTabs,
  closeTab,
  createAttentionTracker,
  createLiveTranslator,
  defaultSettings,
  duplicateLabel,
  emptyTabs,
  formatDuration,
  type HostApi,
  type MenuCategory,
  openTab,
  type Project,
  recentTabs,
  reorderTabs,
  type SessionSnapshot,
  stepFontSize,
  stepOpacity,
  stepTab,
  type TabsState,
} from '@dck/core'
import { createHoldMenuController } from './hold-menu/hold-menu-controller.ts'
import { setFullHeight } from './kit/layout-mode.ts'
import { translateStatic } from './kit/static-text.ts'
import { createEnvironmentSection } from './panel/environment-section.ts'
import { displayPath } from './panel/format.ts'
import { createGitSection } from './panel/git-section.ts'
import { createPanel } from './panel/panel.ts'
import { createSessionsSection } from './panel/sessions-section.ts'
import { localeFor } from './platform/locale.ts'
import { bindShortcuts } from './platform/shortcuts.ts'
import { applyTheme, themeFor, watchSystemTheme } from './platform/theme.ts'
import { createProjectSearch } from './projects/project-search.ts'
import { applyOpacity } from './settings/preferences.ts'
import type { SettingsClient } from './settings/settings-client.ts'
import { createSettingsView } from './settings/settings-view.ts'
import { createNotice } from './tabs/notice.ts'
import { createSessionWatcher } from './tabs/sessions-watcher.ts'
import { createTabBar } from './tabs/tab-bar.ts'
import { createTabList } from './tabs/tab-list.ts'
import { createTabMenu } from './tabs/tab-menu.ts'
import { createTerminalSession, type TerminalSession } from './terminal/terminal-session.ts'
import { createViewsView } from './views/views-view.ts'

export interface AppElements {
  readonly bar: HTMLElement
  readonly tabs: HTMLElement
  readonly tabsNew: HTMLElement
  readonly tabsAll: HTMLElement
  readonly tabList: HTMLElement
  readonly panelToggle: HTMLElement
  readonly host: HTMLElement
  readonly main: HTMLElement
  readonly dock: HTMLElement
  readonly panel: HTMLElement
  readonly rail: HTMLElement
  readonly settingsButton: HTMLElement
  readonly viewsButton: HTMLElement
  readonly split: HTMLElement
  readonly notice: HTMLElement
  readonly menu: HTMLElement
  readonly scrim: HTMLElement
  readonly card: HTMLElement
  readonly hint: HTMLElement
  readonly search: HTMLElement
  readonly searchInput: HTMLInputElement
  readonly searchResults: HTMLElement
  readonly searchHint: HTMLElement
  readonly views: HTMLElement
  readonly settings: HTMLElement
  readonly settingsBody: HTMLElement
}

interface OpenOptions {
  readonly cwd?: string
  readonly label?: string
  readonly project?: string
}

const PROJECT_PREFIX = 'open-project:'

export async function startApp(elements: AppElements, api: HostApi, settings: SettingsClient) {
  const { bar, host } = elements
  const sessions = new Map<string, TerminalSession>()
  const projectTabs = new Map<string, string>()
  const i18n = createLiveTranslator(localeFor(settings.current().language, navigator.languages))
  translateStatic(i18n)
  const notice = createNotice(elements.notice, i18n)
  const menu = createTabMenu(elements.menu)
  let state: TabsState = emptyTabs
  let theme = themeFor(settings.current().theme)
  let counter = 0
  applyTheme(theme)
  applyOpacity(settings.current().opacity)
  let projects: readonly Project[] = []

  const refreshProjects = () =>
    api.projects.list().then((found) => {
      projects = found
    })

  const search = createProjectSearch(
    {
      overlay: elements.search,
      input: elements.searchInput,
      results: elements.searchResults,
      hint: elements.searchHint,
    },
    (path) => openProject(path),
    () => activeSession()?.focus(),
    (path) => void toggleFavorite(path),
    i18n.t,
  )

  const searchEntries = () =>
    projects.map((project) => ({
      path: project.path,
      label: projectLabel(project),
      location: displayPath(project.path),
      favorite: project.favorite === true,
    }))

  function searchProjects() {
    void refreshProjects().then(() => search.open(searchEntries()))
  }

  async function toggleFavorite(path: string) {
    await api.projects.toggleFavorite(path)
    await refreshProjects()
    search.update(searchEntries())
  }

  const settingsView = createSettingsView(
    { overlay: elements.settings, body: elements.settingsBody },
    {
      settings,
      api,
      i18n,
      onClose: () => activeSession()?.focus(),
      previewOpacity: applyOpacity,
    },
  )

  const viewsView = createViewsView(elements.views, {
    api,
    i18n,
    onClose: () => activeSession()?.focus(),
    openSettings: () => settingsView.open('connections'),
    onReviewCount: showReviewCount,
  })

  let reviewCount = 0
  function showReviewCount(count: number) {
    reviewCount = count
    elements.viewsButton.setAttribute(
      'aria-label',
      reviewCount === 0
        ? i18n.t('views.title')
        : `${i18n.t('views.title')}. ${i18n.plural('views.waiting', reviewCount)}`,
    )
  }

  const activeSession = () => (state.activeId ? sessions.get(state.activeId) : undefined)

  let activeSnapshot: SessionSnapshot | undefined
  let environment: ComposeStatus | undefined
  let autoOpened = false

  const attention = createAttentionTracker({
    clock: { now: () => Date.now() },
    notifyAfterMs: () => settings.current().system.notifyAfterSeconds * 1000,
  })

  // Seen means the active tab in a focused window; otherwise the notice stays pending
  const isSeen = (tabId: string) => tabId === state.activeId && document.hasFocus()

  function markActiveSeen() {
    if (state.activeId && document.hasFocus() && attention.unseenIds().includes(state.activeId)) {
      attention.markSeen(state.activeId)
      tabBar.render(state, new Set(attention.unseenIds()))
      panel.render()
    }
  }

  const watcher = createSessionWatcher({
    tabs: () => [...sessions].map(([id, session]) => ({ id, ptyId: session.ptyId })),
    activity: (ptyId) => api.session.activity(ptyId),
    onChange() {
      for (const tab of state.tabs) {
        const info = watcher.get(tab.id)
        if (!info) continue
        const finished = attention.update(tab.id, info, isSeen(tab.id))
        if (finished?.notify) {
          api.notifications.show({
            title: i18n.t('notify.title'),
            body: i18n.t('notify.finished', {
              tab: tab.label,
              process: finished.process,
              duration: formatDuration(finished.durationMs),
            }),
            tabId: tab.id,
          })
        }
      }
      tabBar.render(state, new Set(attention.unseenIds()))
      panel.render()
    },
  })

  const panel = createPanel({
    elements: {
      dock: elements.dock,
      panel: elements.panel,
      rail: elements.rail,
      toggle: elements.panelToggle,
      split: elements.split,
    },
    sections: [
      createSessionsSection(
        {
          tabs: () => state.tabs,
          activeId: () => state.activeId,
          info: (id) => watcher.get(id),
          finished: (id) => attention.finished(id),
          finishedCount: () => attention.unseenIds().length,
          select: (id) => update(activateTab(state, id)),
        },
        i18n,
      ),
      createGitSection(
        { snapshot: () => activeSnapshot, requestRender: () => panel.render() },
        i18n,
      ),
      createEnvironmentSection({ status: () => environment }, i18n),
    ],
    afterPointer: () => activeSession()?.focus(),
    t: i18n.t,
    title: () => {
      const cwd = state.activeId ? watcher.get(state.activeId)?.cwd : undefined
      return cwd ? displayPath(cwd) : ''
    },
    refresh: async (expanded) => {
      const id = activeSession()?.ptyId
      // Docker is only queried with the section open: it is the heaviest read in the panel
      const [snapshot, containers] = await Promise.all([
        id === undefined ? undefined : api.session.inspect(id),
        id !== undefined && expanded.includes('env') ? api.environment.inspect(id) : undefined,
      ])
      activeSnapshot = snapshot
      if (containers) environment = containers
      await watcher.poll()
    },
  })

  function togglePanel() {
    autoOpened = false
    panel.toggle()
  }

  function render() {
    tabBar.render(state, new Set(attention.unseenIds()))
    for (const [id, session] of sessions) {
      session.element.classList.toggle('active', id === state.activeId)
    }
    const active = activeSession()
    active?.fit()
    active?.focus()
    markActiveSeen()
    panel.refresh()
  }

  function update(next: TabsState) {
    if (next === state) return
    state = next
    render()
  }

  function discard(id: string) {
    sessions.get(id)?.dispose()
    sessions.delete(id)
    attention.forget(id)
    for (const [path, tabId] of projectTabs) if (tabId === id) projectTabs.delete(path)
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

  async function open(options: OpenOptions = {}) {
    counter += 1
    const id = `tab-${counter}`
    const session = await createTerminalSession({
      host,
      api,
      theme,
      fontSize: settings.current().fontSize,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      exitedText: i18n.t('terminal.exited'),
      onCopied: (text) => notice.copied(text),
      onExit: () => close(id),
    })
    sessions.set(id, session)
    if (options.project) projectTabs.set(options.project, id)
    update(openTab(state, { id, label: options.label ?? i18n.t('tabs.default', { n: counter }) }))
  }

  async function duplicate(id: string) {
    const ptyId = sessions.get(id)?.ptyId
    // Fresh read: the watcher lags up to one cycle and the user may have just run cd
    const fresh = ptyId === undefined ? undefined : await api.session.activity(ptyId)
    const cwd = fresh?.cwd ?? watcher.get(id)?.cwd
    const label = state.tabs.find((tab) => tab.id === id)?.label
    await open({
      ...(cwd ? { cwd } : {}),
      ...(label
        ? {
            label: duplicateLabel(
              state.tabs.map((tab) => tab.label),
              label,
            ),
          }
        : {}),
    })
  }

  function openProject(path: string) {
    api.projects.touch(path)
    // The host persists the order; here the project moves up right away, without waiting for the next read
    const used = projects.find((project) => project.path === path)
    if (used) projects = [used, ...projects.filter((project) => project !== used)]
    const existing = projectTabs.get(path)
    if (existing && state.tabs.some((tab) => tab.id === existing)) {
      update(activateTab(state, existing))
      return
    }
    const name = projects.find((project) => project.path === path)?.name
    void open({ cwd: path, project: path, ...(name ? { label: name } : {}) })
  }

  // The shortcut and the menu toggle between light and dark: they become an explicit choice, no longer "system"
  function toggleTheme() {
    void settings.update({ theme: theme === 'dark' ? 'light' : 'dark' })
  }

  function showTheme() {
    theme = themeFor(settings.current().theme)
    applyTheme(theme)
    for (const session of sessions.values()) session.setTheme(theme)
  }

  settings.onChange((next, changed) => {
    if (changed.includes('theme')) showTheme()
    if (changed.includes('language')) {
      i18n.setLocale(localeFor(next.language, navigator.languages))
      translateStatic(i18n)
      panel.retranslate()
      search.retranslate()
      viewsView.retranslate()
      showReviewCount(reviewCount)
      settingsView.rerender()
      tabBar.render(state, new Set(attention.unseenIds()))
    }
    // The folder and depth are only read when listing: reload for the menu and the search
    if (changed.some((key) => key.startsWith('projects.'))) void refreshProjects()
    if (changed.includes('opacity')) applyOpacity(next.opacity)
    if (changed.includes('fontSize')) {
      for (const session of sessions.values()) session.setFontSize(next.fontSize)
    }
  })
  // In "system" mode the desktop may switch themes while the cockpit is open
  watchSystemTheme(() => {
    if (settings.current().theme === 'system') showTheme()
  })

  const tabBar = createTabBar(
    elements.tabs,
    {
      hiddenAttention(hidden) {
        elements.tabsAll.dataset.attention = String(hidden)
        elements.tabsAll.setAttribute(
          'aria-label',
          hidden ? `${i18n.t('tabs.all')}, ${i18n.t('tabs.finished')}` : i18n.t('tabs.all'),
        )
      },
      activate: (id) => update(activateTab(state, id)),
      reorder: (ids) => {
        state = reorderTabs(state, ids)
        render()
      },
      contextMenu(id, x, y) {
        const several = state.tabs.length > 1
        menu.open(
          [
            { label: i18n.t('tabs.close'), enabled: several, run: () => close(id) },
            { label: i18n.t('tabs.closeOthers'), enabled: several, run: () => closeOthers(id) },
            { label: i18n.t('tabs.duplicate'), enabled: true, run: () => void duplicate(id) },
          ],
          x,
          y,
          !document.body.classList.contains('full'),
        )
      },
    },
    () => i18n.t('tabs.finished'),
  )

  elements.tabsNew.addEventListener('click', () => void open())

  createTabList(elements.tabList, elements.tabsAll, {
    entries() {
      const finished = new Set(attention.unseenIds())
      return state.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        current: tab.id === state.activeId,
        finished: finished.has(tab.id),
      }))
    },
    onPick: (id) => update(activateTab(state, id)),
    onClose: () => activeSession()?.focus(),
    barOnTop: () => document.body.classList.contains('full'),
    t: i18n.t,
  })

  const actions = {
    newTab: () => void open(),
    closeTab: () => state.activeId && close(state.activeId),
    nextTab: () => update(stepTab(state, 1)),
    previousTab: () => update(stepTab(state, -1)),
    goToTab: (index: number) => update(activateTabAt(state, index)),
    toggleTheme,
    openSettings: () => settingsView.open(),
    openViews: () => void viewsView.open(),
    searchProjects,
    togglePanel,
    toggleFullHeight: () => api.window.toggleFullHeight(),
    nextFinished() {
      const id = attention.unseenIds()[0]
      if (id) update(activateTab(state, id))
    },
    changeOpacity(direction: 1 | -1) {
      void settings.update({ opacity: stepOpacity(settings.current().opacity, direction) })
    },
    changeFontSize(delta: number | 'reset') {
      const size =
        delta === 'reset'
          ? defaultSettings.fontSize
          : stepFontSize(settings.current().fontSize, delta)
      void settings.update({ fontSize: size })
    },
  }
  bindShortcuts(actions)

  const commands: Record<string, () => void> = {
    'tab:new': actions.newTab,
    'tab:close': actions.closeTab,
    'tab:next': actions.nextTab,
    'tab:previous': actions.previousTab,
    'tab:finished': actions.nextFinished,
    'agent:claude': () => activeSession()?.write('claude\r'),
    'agent:resume': () => activeSession()?.write('claude --resume\r'),
    'system:full-height': () => api.window.toggleFullHeight(),
    'system:theme': toggleTheme,
    'system:settings': () => settingsView.open(),
    'system:panel': togglePanel,
    'project:search': searchProjects,
    'views:open': () => void viewsView.open(),
  }

  // Repeated names get their parent folder to tell them apart in the list
  function projectLabel(project: Project) {
    const repeated = projects.filter((other) => other.name === project.name).length > 1
    if (!repeated) return project.name
    const parent = project.path.split('/').at(-2)
    return parent ? `${parent}/${project.name}` : project.name
  }

  function categories(): readonly MenuCategory[] {
    return [
      {
        id: 'tabs',
        label: i18n.t('menu.cat.tabs'),
        icon: 'window',
        items: [
          { id: 'tab:new', label: i18n.t('tabs.new'), shortcut: 'Ctrl+Shift+T' },
          { id: 'tab:close', label: i18n.t('tabs.close'), shortcut: 'Ctrl+Shift+W' },
          { id: 'tab:next', label: i18n.t('tabs.next'), shortcut: 'Ctrl+Tab' },
          { id: 'tab:previous', label: i18n.t('tabs.previous'), shortcut: 'Ctrl+Shift+Tab' },
          { id: 'tab:finished', label: i18n.t('tabs.nextFinished') },
        ],
      },
      {
        id: 'projects',
        label: i18n.t('menu.cat.projects'),
        icon: 'folder',
        items: [
          {
            id: 'project:search',
            label: `${i18n.t('projects.search')}…`,
            shortcut: 'Ctrl+Shift+P',
          },
          { id: 'views:open', label: i18n.t('views.open'), shortcut: 'Ctrl+Shift+M' },
          ...projects.map((project) => ({
            id: `${PROJECT_PREFIX}${project.path}`,
            label: projectLabel(project),
          })),
        ],
      },
      {
        id: 'agent',
        label: i18n.t('menu.cat.agent'),
        icon: 'terminal',
        items: [
          { id: 'agent:claude', label: i18n.t('menu.agent.start') },
          { id: 'agent:resume', label: i18n.t('menu.agent.resume') },
        ],
      },
      {
        id: 'system',
        label: i18n.t('menu.cat.system'),
        icon: 'sliders',
        items: [
          { id: 'system:full-height', label: i18n.t('menu.system.fullHeight'), shortcut: 'F11' },
          {
            id: 'system:settings',
            label: i18n.t('menu.system.settings'),
            shortcut: 'Ctrl+,',
          },
          { id: 'system:panel', label: i18n.t('menu.system.panel'), shortcut: 'Ctrl+Shift+B' },
          { id: 'system:theme', label: i18n.t('menu.system.theme'), shortcut: 'Ctrl+Shift+L' },
        ],
      },
    ]
  }

  createHoldMenuController(
    { scrim: elements.scrim, card: elements.card, hint: elements.hint, bar },
    {
      categories: () => {
        void refreshProjects()
        return categories()
      },
      tabs: () =>
        recentTabs(state).map((tab) => ({
          id: tab.id,
          label: tab.label,
          current: tab.id === state.activeId,
        })),
      run(_categoryId, item) {
        if (item.id.startsWith(PROJECT_PREFIX)) openProject(item.id.slice(PROJECT_PREFIX.length))
        else commands[item.id]?.()
      },
      switchTo: (id) => update(activateTab(state, id)),
      triggerCode: () => settings.current().shortcuts.holdTrigger,
    },
    {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    i18n.t,
  )

  api.window.onFullHeightChange((full) => {
    setFullHeight(full, [bar, elements.main])
    // At full height there is spare room: the panel opens by itself and returns to what it was on exit
    if (full && settings.current().window.panelOnFullHeight && !panel.isOpen()) {
      panel.open()
      autoOpened = true
    } else if (!full && autoOpened) {
      panel.close()
      autoOpened = false
    }
  })
  window.addEventListener('focus', markActiveSeen)
  api.notifications.onClick((tabId) => {
    if (state.tabs.some((tab) => tab.id === tabId)) update(activateTab(state, tabId))
  })
  elements.settingsButton.addEventListener('click', () => settingsView.toggle())
  elements.viewsButton.addEventListener('click', () => viewsView.toggle())
  showReviewCount(0)
  void viewsView.warm()
  api.window.onShown(() => void viewsView.warm())
  api.window.onOpenSettings(() => settingsView.open())
  api.window.onShown(() => {
    setTimeout(markActiveSeen, 150)
    document.body.classList.remove('enter')
    void document.body.offsetWidth
    document.body.classList.add('enter')
  })

  await refreshProjects()
  await open()
}
