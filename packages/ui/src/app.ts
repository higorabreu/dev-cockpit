import {
  type AgentEvent,
  type AgentProfile,
  activateTab,
  activateTabAt,
  type ComposeStatus,
  closeOtherTabs,
  closeTab,
  createAttentionTracker,
  createConnectHint,
  createLiveTranslator,
  defaultSettings,
  duplicateLabel,
  emptyTabs,
  formatDuration,
  type HostApi,
  type MenuCategory,
  openTab,
  type PluralKey,
  type Project,
  recentTabs,
  reorderTabs,
  type SessionSnapshot,
  stepFontSize,
  stepOpacity,
  stepTab,
  type TabsState,
} from '@dck/core'
import { CONNECT_ITEM, createAgentConnect } from './agents/agent-connect.ts'
import { createHoldMenuController } from './hold-menu/hold-menu-controller.ts'
import { setFullHeight } from './kit/layout-mode.ts'
import { translateStatic } from './kit/static-text.ts'
import { setTipRegion } from './kit/tooltip.ts'
import { createEnvironmentSection } from './panel/environment-section.ts'
import { displayPath } from './panel/format.ts'
import { createGitSection } from './panel/git-section.ts'
import { createPanel } from './panel/panel.ts'
import { createSessionsSection } from './panel/sessions-section.ts'
import { createSplitPreferences } from './panes/split-preferences.ts'
import { createTabView, type TabView } from './panes/tab-view.ts'
import { localeFor } from './platform/locale.ts'
import { bindShortcuts } from './platform/shortcuts.ts'
import { applyTheme, themeFor, watchSystemTheme } from './platform/theme.ts'
import { createProjectSearch } from './projects/project-search.ts'
import { LAYOUT_KEY } from './review/review-pane.ts'
import { createReviewTabs } from './review/review-tabs.ts'
import { applyOpacity } from './settings/preferences.ts'
import type { SettingsClient } from './settings/settings-client.ts'
import { createSettingsView } from './settings/settings-view.ts'
import { attentionMark } from './tabs/attention-mark.ts'
import { createNotice } from './tabs/notice.ts'
import { createSessionWatcher } from './tabs/sessions-watcher.ts'
import { createTabBar } from './tabs/tab-bar.ts'
import { createTabList } from './tabs/tab-list.ts'
import { createTabMenu } from './tabs/tab-menu.ts'
import { linkModifierFor } from './terminal/terminal-links.ts'
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
  // Each tab's panes: its terminal and, when open, the review beside or below it
  const tabViews = new Map<string, TabView>()
  const split = createSplitPreferences({
    current: () => settings.current(),
    update: (patch) => void settings.update(patch),
    after(milliseconds, task) {
      const timer = setTimeout(task, milliseconds)
      return () => clearTimeout(timer)
    },
  })
  const projectTabs = new Map<string, string>()
  const i18n = createLiveTranslator(localeFor(settings.current().language, navigator.languages))
  translateStatic(i18n)
  const linkModifier = linkModifierFor(navigator.platform)
  const nativeMiddlePaste = navigator.platform.startsWith('Linux')
  const notice = createNotice(elements.notice, i18n)
  const menu = createTabMenu(elements.menu)
  const modifierName = linkModifier === 'meta' ? 'Cmd' : 'Ctrl'
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
    () => focusActive(),
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
      onClose: () => focusActive(),
      previewOpacity: applyOpacity,
    },
  )

  const viewsView = createViewsView(elements.views, {
    api,
    i18n,
    onClose: () => focusActive(),
    openSettings: () => settingsView.open('connections'),
    onBadge: showBadge,
  })

  let badge: { count: number; label: PluralKey | undefined } = { count: 0, label: undefined }
  function showBadge(count: number, label: PluralKey | undefined) {
    badge = { count, label }
    elements.viewsButton.setAttribute(
      'aria-label',
      count === 0 || label === undefined
        ? i18n.t('views.title')
        : `${i18n.t('views.title')}. ${i18n.plural(label, count)}`,
    )
  }

  const activeSession = () => (state.activeId ? sessions.get(state.activeId) : undefined)
  // The pane of the active tab that last had the keys: its terminal or its review
  const focusActive = () =>
    state.activeId ? tabViews.get(state.activeId)?.focusCurrent() : undefined

  const reviews = createReviewTabs({
    api,
    i18n,
    modifier: modifierName,
    isModified: (event) => (linkModifier === 'meta' ? event.metaKey : event.ctrlKey),
    view: (tabId) => tabViews.get(tabId),
    // Fresh read: the watcher lags up to one cycle and the user may have just run cd
    async cwd(tabId) {
      const ptyId = sessions.get(tabId)?.ptyId
      const fresh = ptyId === undefined ? undefined : await api.session.activity(ptyId)
      return fresh?.cwd ?? watcher.get(tabId)?.cwd
    },
    agent: (tabId) => attention.agent(tabId),
    chooseLayout: (orientation) => split.setPreference(orientation),
  })

  let activeSnapshot: SessionSnapshot | undefined
  let environment: ComposeStatus | undefined
  let autoOpened = false

  const attention = createAttentionTracker({
    clock: { now: () => Date.now() },
    notifyAfterMs: () => settings.current().system.notifyAfterSeconds * 1000,
  })

  const connectHint = createConnectHint({
    clock: { now: () => Date.now() },
    enabled: () => settings.current().system.agentConnectHint,
  })
  let agentProfiles: readonly AgentProfile[] = []
  void api.agent.profiles().then((profiles) => {
    agentProfiles = profiles
  })
  const agentConnect = createAgentConnect({
    profiles: () => agentProfiles,
    info: (tabId) => watcher.get(tabId),
    write: (tabId, text) => sessions.get(tabId)?.write(text),
  })

  // The command lands in the tab on screen, with the focus, so the user reads it and presses Enter
  function connectTab(tabId: string) {
    if (!agentConnect.connect(tabId)) return
    connectHint.handled(tabId)
    update(activateTab(state, tabId))
    tabViews.get(tabId)?.focus(tabId)
    panel.render()
  }

  // Seen means the active tab in a focused window; otherwise the notice stays pending
  const isSeen = (tabId: string) => tabId === state.activeId && document.hasFocus()

  function announce(event: AgentEvent) {
    const tab = state.tabs.find((candidate) => candidate.id === event.tabId)
    if (!event.notify || !tab) return
    api.notifications.show({
      title: i18n.t('notify.title'),
      body:
        event.kind === 'needs-you'
          ? i18n.t('notify.needsYou', { tab: tab.label })
          : i18n.t('notify.agentAnswered', {
              tab: tab.label,
              duration: formatDuration(event.durationMs),
            }),
      tabId: tab.id,
    })
  }

  // A tab whose review is open but hidden behind its terminal (narrow) says so in the bar
  function hiddenReviews(): ReadonlySet<string> {
    const hidden = new Set<string>()
    for (const [id, view] of tabViews) {
      if (reviews.isOpen(id) && !view.isShown(`${id}:review`)) hidden.add(id)
    }
    return hidden
  }

  function renderTabs() {
    tabBar.render(state, attention.marks(), hiddenReviews())
  }

  function showAttention() {
    renderTabs()
    panel.render()
  }

  // Esc fires no agent signal, so a working agent's terminal is checked for silence while one works
  let quietTimer: ReturnType<typeof setInterval> | undefined
  function watchQuiet() {
    if (quietTimer || !attention.hasWorkingAgent()) return
    quietTimer = setInterval(() => {
      attention.settle((id) => sessions.get(id)?.lastOutputAt())
      reviews.syncAgents()
      if (attention.hasWorkingAgent()) return
      clearInterval(quietTimer)
      quietTimer = undefined
    }, 1000)
  }

  function tabOfPty(ptyId: number) {
    for (const [id, session] of sessions) if (session.ptyId === ptyId) return id
    return undefined
  }

  api.agent.onSignal((signal) => {
    const tabId = tabOfPty(signal.ptyId)
    if (!tabId) return
    connectHint.signal(tabId)
    const event = attention.signal(tabId, signal.state, isSeen(tabId))
    if (event) announce(event)
    reviews.syncAgents()
    watchQuiet()
    showAttention()
  })

  function markActiveSeen() {
    if (state.activeId && document.hasFocus() && attention.unseenIds().includes(state.activeId)) {
      attention.markSeen(state.activeId)
      showAttention()
    }
  }

  const watcher = createSessionWatcher({
    tabs: () => [...sessions].map(([id, session]) => ({ id, ptyId: session.ptyId })),
    activity: (ptyId) => api.session.activity(ptyId),
    onChange() {
      for (const tab of state.tabs) {
        const info = watcher.get(tab.id)
        if (!info) continue
        connectHint.update(tab.id, info.activity === 'agent' ? info.agent : undefined)
        const finished = attention.update(tab.id, info, isSeen(tab.id))
        if (finished) announce({ kind: 'finished', ...finished })
      }
      reviews.syncAgents()
      showAttention()
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
          needsYou: (id) => attention.attention(id) === 'needs-you',
          finishedCount: () => attention.unseenIds().length,
          select: (id) => update(activateTab(state, id)),
          connectHint: (id) => connectHint.shown(id),
          connect: connectTab,
          dismissConnect() {
            void settings.update({ system: { agentConnectHint: false } })
            focusActive()
          },
        },
        i18n,
      ),
      createGitSection(
        { snapshot: () => activeSnapshot, requestRender: () => panel.render() },
        i18n,
      ),
      createEnvironmentSection({ status: () => environment }, i18n),
    ],
    afterPointer: () => focusActive(),
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
    renderTabs()
    for (const [id, view] of tabViews) view.setActive(id === state.activeId)
    activeSession()?.fit()
    focusActive()
    markActiveSeen()
    panel.refresh()
  }

  function update(next: TabsState) {
    if (next === state) return
    state = next
    render()
  }

  function discard(id: string) {
    reviews.forget(id)
    sessions.get(id)?.dispose()
    sessions.delete(id)
    tabViews.get(id)?.dispose()
    tabViews.delete(id)
    attention.forget(id)
    connectHint.forget(id)
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
    const view = createTabView(host, {
      t: i18n.t,
      preferences: () => split.current(),
      onRatio: (orientation, ratio) => split.saveRatio(orientation, ratio),
      onArrange: (orientation, narrow) => reviews.arranged(id, orientation, narrow),
      onShownChange: () => renderTabs(),
    })
    tabViews.set(id, view)
    const session = await createTerminalSession({
      host: view.element,
      api,
      theme,
      fontSize: settings.current().fontSize,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      exitedText: i18n.t('terminal.exited'),
      nativeMiddlePaste,
      links: {
        modifier: linkModifier,
        keyLabel: () => i18n.t('terminal.openLink', { modifier: modifierName }),
        tip: setTipRegion,
      },
      paths: {
        modifier: linkModifier,
        keyLabel: () => i18n.t('terminal.openPath', { modifier: modifierName }),
        cwd: () => watcher.get(id)?.cwd,
        openFolder: (path, x, y) => openFolderMenu(id, path, x, y),
        tip: setTipRegion,
      },
      onCopied: (text) => notice.copied(text),
      onExit: () => close(id),
      onInput() {
        attention.input(id)
        watchQuiet()
      },
    })
    sessions.set(id, session)
    view.setTerminal({
      id,
      kind: 'terminal',
      element: session.element,
      focus: () => session.focus(),
      grid: () => session.grid(),
    })
    if (options.project) projectTabs.set(options.project, id)
    update(openTab(state, { id, label: options.label ?? i18n.t('tabs.default', { n: counter }) }))
  }

  // A folder Ctrl+clicked in a terminal: a tab there or the file manager; the focus returns to that terminal
  function openFolderMenu(tabId: string, path: string, x: number, y: number) {
    menu.open(
      [
        {
          label: i18n.t('terminal.openInNewTab'),
          enabled: true,
          run: () => void open({ cwd: path }),
        },
        {
          label: i18n.t('terminal.openInFileManager'),
          enabled: true,
          run: () => api.paths.openFolder(path),
        },
      ],
      x,
      y,
      false,
      () => sessions.get(tabId)?.focus(),
    )
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
      reviews.retranslate()
      for (const view of tabViews.values()) view.retranslate()
      showBadge(badge.count, badge.label)
      settingsView.rerender()
      renderTabs()
    }
    // The folder and depth are only read when listing: reload for the menu and the search
    if (changed.some((key) => key.startsWith('projects.'))) void refreshProjects()
    if (changed.includes('opacity')) applyOpacity(next.opacity)
    if (changed.includes('system.agentConnectHint')) panel.render()
    // A connector was enabled or disabled: its tabs and the badge follow
    if (changed.includes('extensions.disabled')) void viewsView.warm()
    if (changed.includes('fontSize')) {
      for (const session of sessions.values()) session.setFontSize(next.fontSize)
    }
    // The layout or a kept share changed, here or in another window; a new font changes the columns
    if (changed.includes('fontSize') || changed.some((key) => key.startsWith('review.'))) {
      for (const view of tabViews.values()) view.relayout()
    }
  })
  // In "system" mode the desktop may switch themes while the cockpit is open
  watchSystemTheme(() => {
    if (settings.current().theme === 'system') showTheme()
  })

  const tabBar = createTabBar(
    elements.tabs,
    {
      hiddenAttention(kind) {
        if (kind) elements.tabsAll.dataset.attention = kind
        else delete elements.tabsAll.dataset.attention
        const label = kind
          ? `${i18n.t('tabs.all')}, ${attentionMark(kind, i18n.t).label}`
          : i18n.t('tabs.all')
        elements.tabsAll.setAttribute('aria-label', label)
        elements.tabsAll.setAttribute('data-tip', label)
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
            {
              label: i18n.t(reviews.isOpen(id) ? 'review.close' : 'review.toggle'),
              enabled: true,
              run: () => (reviews.isOpen(id) ? reviews.close(id) : toggleReview(id)),
            },
          ],
          x,
          y,
          !document.body.classList.contains('full'),
        )
      },
    },
    i18n.t,
  )

  elements.tabsNew.addEventListener('click', () => void open())

  createTabList(elements.tabList, elements.tabsAll, {
    // Only names: the state of each tab lives in the Sessions section
    entries: () =>
      state.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        current: tab.id === state.activeId,
      })),
    onPick: (id) => update(activateTab(state, id)),
    onClose: () => focusActive(),
    barOnTop: () => document.body.classList.contains('full'),
    t: i18n.t,
  })

  // The review belongs to a tab: it opens on that tab, which comes to the front
  function toggleReview(id: string) {
    update(activateTab(state, id))
    reviews.toggle(id)
  }

  const actions = {
    newTab: () => void open(),
    toggleReview: () => state.activeId && toggleReview(state.activeId),
    toggleReviewLayout: () => state.activeId && reviews.toggleLayout(state.activeId),
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
      const id = attention.nextUnseen(state.activeId)
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
    'tab:review': actions.toggleReview,
    'tab:review-layout': actions.toggleReviewLayout,
    'agent:claude': () => activeSession()?.write('claude\r'),
    'agent:resume': () => activeSession()?.write('claude --resume\r'),
    [CONNECT_ITEM]: () => state.activeId && connectTab(state.activeId),
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
          { id: 'tab:review', label: i18n.t('review.toggle'), shortcut: 'Ctrl+Shift+D' },
          { id: 'tab:review-layout', label: i18n.t('review.layout.toggle'), shortcut: LAYOUT_KEY },
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
          ...agentConnect.menuItems(i18n.t),
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
  showBadge(0, undefined)
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
