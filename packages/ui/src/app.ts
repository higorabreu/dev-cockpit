import {
  type AgentEvent,
  type AgentProfile,
  absolutePath,
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
  type HostApi,
  holdsMiddleButton,
  JIRA_CONNECTOR,
  jiraTicketLink,
  localeFor,
  type MenuCategory,
  noSystemFonts,
  notificationText,
  openTab,
  type ProgramStatus,
  type Project,
  relativePath,
  renameTab,
  reorderTabs,
  reviewBaseFor,
  reviewBasePatch,
  type SavedTabs,
  type SessionSnapshot,
  type SystemFontsInfo,
  sameSavedTabs,
  stepFontSize,
  stepOpacity,
  stepTab,
  storedAccount,
  type TabsState,
  tabsToSave,
} from '@dck/core'
import { CONNECT_ITEM, createAgentConnect } from './agents/agent-connect.ts'
import { createFileRanker, startRankWorker } from './file-search/file-ranker.ts'
import { createFileSearch } from './file-search/file-search.ts'
import { createFileTabs, type LeaveAnswer } from './files/file-tabs.ts'
import { recentLabel } from './files/path-parts.ts'
import { createHoldMenuController } from './hold-menu/hold-menu-controller.ts'
import { setFullHeight } from './kit/layout-mode.ts'
import { showRailDot } from './kit/rail-dot.ts'
import { translateStatic } from './kit/static-text.ts'
import { setTipRegion } from './kit/tooltip.ts'
import { createEnvironmentSection } from './panel/environment-section.ts'
import { displayPath } from './panel/format.ts'
import { createGitSection } from './panel/git-section.ts'
import { createPanel } from './panel/panel.ts'
import { createSessionsSection } from './panel/sessions-section.ts'
import { createSplitPreferences } from './panes/split-preferences.ts'
import { createTabView, type TabView } from './panes/tab-view.ts'
import { applyAppearance, loadFont, terminalLook } from './platform/appearance.ts'
import type { Keymap, TabTarget } from './platform/keymap.ts'
import { bindShortcuts } from './platform/shortcuts.ts'
import { applyTheme, themeFor, watchSystemTheme } from './platform/theme.ts'
import { createProjectSearch } from './projects/project-search.ts'
import { createRootChooser } from './projects/root-chooser.ts'
import { createQuitCard } from './quit/quit-card.ts'
import { createReviewTabs } from './review/review-tabs.ts'
import { applyOpacity } from './settings/preferences.ts'
import type { SettingsClient } from './settings/settings-client.ts'
import { createSettingsView } from './settings/settings-view.ts'
import { createNotice } from './tabs/notice.ts'
import { createSessionWatcher } from './tabs/sessions-watcher.ts'
import { createTabBar } from './tabs/tab-bar.ts'
import { createTabList } from './tabs/tab-list.ts'
import { createTabMenu } from './tabs/tab-menu.ts'
import { createTerminalSession, type TerminalSession } from './terminal/terminal-session.ts'
import { createUpdateNotice } from './updates/update-notice.ts'
import { createSeenMarks } from './views/seen-marks.ts'
import { createViewsView } from './views/views-view.ts'
import { createResizeEdge } from './window/resize-edge.ts'

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
  // The window's bottom edge, dragged to change its height, and the percent it shows meanwhile
  readonly edge: HTMLElement
  readonly edgeSize: HTMLElement
  readonly notice: HTMLElement
  readonly menu: HTMLElement
  readonly quit: HTMLElement
  readonly scrim: HTMLElement
  readonly card: HTMLElement
  readonly hint: HTMLElement
  readonly search: HTMLElement
  readonly searchInput: HTMLInputElement
  readonly searchResults: HTMLElement
  readonly searchHint: HTMLElement
  readonly files: HTMLElement
  readonly filesInput: HTMLInputElement
  readonly filesResults: HTMLElement
  readonly filesHint: HTMLElement
  readonly views: HTMLElement
  readonly settings: HTMLElement
  readonly settingsBody: HTMLElement
}

// A burst of changes, such as several tabs opening, is written once
const SAVE_TABS_MS = 600

interface OpenOptions {
  readonly cwd?: string
  readonly label?: string
  readonly project?: string
}

const PROJECT_PREFIX = 'open-project:'

export async function startApp(
  elements: AppElements,
  api: HostApi,
  settings: SettingsClient,
  keymap: Keymap,
) {
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
  const nativeMiddlePaste = navigator.platform.startsWith('Linux')
  // The hold menu's key or mouse button, read at each use: Settings can change it while the window is open
  const holdTrigger = () => settings.current().shortcuts.holdTrigger ?? keymap.holdTrigger
  const notice = createNotice(elements.notice, i18n, elements.tabs)
  const updateNotice = createUpdateNotice({
    notice,
    i18n,
    updates: api.updates,
    agentTabs: () => state.tabs.filter((tab) => watcher.get(tab.id)?.activity === 'agent').length,
    saveTabs: () => saveTabsNow(),
    done: () => focusActive(),
    openMenu(actions, anchor, caption) {
      // Off the bar on the terminal's side, its right edge on the icon's
      const right = anchor.getBoundingClientRect().right
      const box = bar.getBoundingClientRect()
      const above = !document.body.classList.contains('full')
      return menu.open(
        actions,
        right,
        above ? box.top : box.bottom,
        above,
        // Closed with Esc or a click elsewhere, the focus goes back to the icon as it is drawn now
        () => elements.notice.querySelector<HTMLElement>('.notice-icon')?.focus(),
        caption === undefined ? { align: 'end' } : { align: 'end', caption },
      )
    },
  })
  const menu = createTabMenu(elements.menu)
  // Before the cockpit's keys are bound: while it asks, they stay quiet
  const quitCard = createQuitCard(elements.quit, {
    i18n,
    quitKey: keymap.commandLabel('q'),
    answer: (quit) => api.quit.answer(quit),
    closeOthers: () => menu.close(),
    done: () => focusActive(),
  })
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

  const rootChooser = createRootChooser({ pick: () => api.projects.chooseRoot(), settings })
  const search = createProjectSearch(
    {
      overlay: elements.search,
      input: elements.searchInput,
      results: elements.searchResults,
      hint: elements.searchHint,
    },
    {
      onPick: (path) => openProject(path),
      onClose: () => focusActive(),
      onToggleFavorite: (path) => void toggleFavorite(path),
      onChooseRoot: () => void chooseProjectsRoot(),
      t: i18n.t,
      keymap,
    },
  )

  const searchEntries = () =>
    projects.map((project) => ({
      path: project.path,
      label: projectLabel(project),
      location: displayPath(project.path),
      favorite: project.favorite === true,
    }))

  // A picked file opens over the active tab, which keeps it in its recent list
  function openPickedFile(root: string, path: string) {
    const id = state.activeId
    if (id !== undefined) void fileTabs.openFile(id, absolutePath(root, path))
  }

  const fileSearch = createFileSearch(
    {
      overlay: elements.files,
      input: elements.filesInput,
      results: elements.filesResults,
      hint: elements.filesHint,
    },
    {
      list: (cwd) => api.fileSearch.list(cwd),
      others: (root) => api.fileSearch.others(root),
      expand: (root, folder) => api.fileSearch.expand(root, folder),
      ranker: createFileRanker(startRankWorker),
      onPick: openPickedFile,
      onClose: () => focusActive(),
      i18n,
      keymap,
    },
  )

  // The tab's folder as the shell has it now: the user may have just run cd
  async function tabFolder(): Promise<string | undefined> {
    const id = state.activeId
    if (id === undefined) return undefined
    const ptyId = sessions.get(id)?.ptyId
    const fresh = ptyId === undefined ? undefined : await api.session.activity(ptyId)
    return fresh?.cwd ?? watcher.get(id)?.cwd
  }

  // The same key again, with the search open, widens it to the files git ignores
  function searchFiles() {
    if (fileSearch.isOpen()) return fileSearch.toggleWiden()
    if (search.isOpen()) search.close()
    const recent = state.activeId === undefined ? [] : fileTabs.recent(state.activeId)
    void fileSearch.open(tabFolder(), (root) =>
      recent.flatMap((file) => relativePath(root, file) ?? []),
    )
  }

  function searchProjects() {
    fileSearch.close()
    if (rootChooser.needed()) search.askForRoot()
    else void refreshProjects().then(() => search.open(searchEntries()))
  }

  // Saved, the search goes on with the new folder; cancelled, it keeps asking
  async function chooseProjectsRoot() {
    if (await rootChooser.choose()) searchProjects()
    else search.askForRoot()
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
      keymap,
    },
  )

  const viewsView = createViewsView(elements.views, {
    api,
    i18n,
    onClose: () => focusActive(),
    openSettings: () => settingsView.open('connections'),
    onWaiting: showWorkWaiting,
    seen: createSeenMarks(localStorage),
    // The ticket link in the Git section follows the Jira tasks as they arrive
    onItems: () => panel.render(),
    keymap,
  })

  let workWaiting = 0
  function showWorkWaiting(count: number) {
    workWaiting = count
    showRailDot(elements.viewsButton, i18n, i18n.t('views.title'), count)
  }

  const activeSession = () => (state.activeId ? sessions.get(state.activeId) : undefined)
  // The file over the active tab when it shows, else the pane that last had the keys: its terminal or
  // its review
  const focusActive = () => {
    const id = state.activeId
    if (id !== undefined && !fileTabs.focus(id)) tabViews.get(id)?.focusCurrent()
  }

  // With auto save off, a file with edits about to close or be replaced asks, from its tab, as a menu with
  // a caption; Esc or a click elsewhere cancels
  function askLeave(tabId: string, name: string): Promise<LeaveAnswer> {
    return new Promise((resolve) => {
      let answer: LeaveAnswer = 'cancel'
      const tab = [...elements.tabs.querySelectorAll<HTMLElement>('.tab')].find(
        (element) => element.dataset.id === tabId,
      )
      const box = (tab ?? bar).getBoundingClientRect()
      const above = !document.body.classList.contains('full')
      const choose = (value: LeaveAnswer) => () => {
        answer = value
      }
      menu.open(
        [
          { label: i18n.t('files.save'), enabled: true, run: choose('save') },
          { label: i18n.t('files.discard'), enabled: true, run: choose('discard') },
          { label: i18n.t('files.cancel'), enabled: true, run: choose('cancel') },
        ],
        box.left,
        above ? box.top : box.bottom,
        above,
        // The menu closes before the chosen item runs, so the answer is read a moment later
        () => setTimeout(() => resolve(answer)),
        { caption: i18n.t('files.ask', { name }) },
      )
    })
  }

  const fileTabs = createFileTabs({
    api,
    i18n,
    mac: keymap.keyboard === 'mac',
    editorKeys: {
      find: keymap.commandLabel('f'),
      goToLine: keymap.chordLabel({ ctrl: true, key: 'g' }),
    },
    host: (tabId) => tabViews.get(tabId)?.element,
    cwd: (tabId) => watcher.get(tabId)?.cwd,
    autoSave: () => settings.current().files.autoSave,
    autoMerge: () => settings.current().files.autoMerge,
    ask: askLeave,
    onChange() {
      renderTabs()
      saveTabsSoon()
    },
    focusTerminal: (tabId) => tabViews.get(tabId)?.focusCurrent(),
    loadEditor: () => import('./editor/code-editor.ts'),
    after(milliseconds, task) {
      const timer = setTimeout(task, milliseconds)
      return () => clearTimeout(timer)
    },
  })

  // The file segment's right click: the tab's recent files to switch to, and Close file
  function openFileMenu(tabId: string, x: number, y: number) {
    const current = fileTabs.appendix(tabId)?.path
    const recent = fileTabs.recent(tabId).filter((path) => path !== current)
    const files =
      recent.length === 0
        ? [{ label: i18n.t('files.noRecent'), enabled: false, run: () => undefined }]
        : recent.map((path) => ({
            label: recentLabel(path, recent),
            enabled: true,
            run: () => void fileTabs.openFile(tabId, path),
          }))
    const save = {
      label: i18n.t('files.save'),
      enabled: fileTabs.appendix(tabId)?.mark === 'unsaved',
      key: keymap.commandLabel('s'),
      run: () => fileTabs.save(tabId),
    }
    const close = {
      label: i18n.t('files.close'),
      enabled: true,
      run: () => void fileTabs.closeFile(tabId),
    }
    menu.open(
      [...files, save, close],
      x,
      y,
      !document.body.classList.contains('full'),
      () => focusActive(),
      { caption: i18n.t('files.recent') },
    )
  }

  // The toggle key, the hold menu and the tab's menu: between the terminal (with its review) and the file
  function toggleFile(tabId: string) {
    update(activateTab(state, tabId))
    fileTabs.toggle(tabId)
  }

  // The review opens under a file that shows: the file steps aside, so the keys reach what is on screen
  function showPanes(tabId: string): string {
    if (fileTabs.isShown(tabId)) fileTabs.show(tabId, false)
    return tabId
  }

  const fileLabel = (tabId: string) =>
    i18n.t(fileTabs.isShown(tabId) ? 'files.showTerminal' : 'files.show')

  // The editor writes in the terminal's font family and size
  function applyEditorFont() {
    const root = document.documentElement.style
    root.setProperty(
      '--editor-font-family',
      terminalLook(settings.current(), systemFonts).fontFamily,
    )
    root.setProperty('--editor-font-size', `${settings.current().fontSize}px`)
  }

  const reviews = createReviewTabs({
    api,
    i18n,
    keymap,
    view: (tabId) => tabViews.get(tabId),
    // Fresh read: the watcher lags up to one cycle and the user may have just run cd
    async cwd(tabId) {
      const ptyId = sessions.get(tabId)?.ptyId
      const fresh = ptyId === undefined ? undefined : await api.session.activity(ptyId)
      return fresh?.cwd ?? watcher.get(tabId)?.cwd
    },
    agent: (tabId) => attention.agent(tabId),
    chooseLayout: (orientation) => split.setPreference(orientation),
    baseFor: (cwd) => reviewBaseFor(settings.current(), cwd),
    chooseBase: (root, name) => settings.update(reviewBasePatch(root, name)).then(() => undefined),
    paste: (tabId, text) => sessions.get(tabId)?.paste(text) ?? false,
    watched: (tabId) => watcher.get(tabId),
    async activity(tabId) {
      const ptyId = sessions.get(tabId)?.ptyId
      return ptyId === undefined ? undefined : api.session.activity(ptyId)
    },
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
      body: notificationText(event, tab.label, i18n.t),
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
    const files = new Map(
      state.tabs.flatMap((tab) => {
        const appendix = fileTabs.appendix(tab.id)
        return appendix ? [[tab.id, appendix] as const] : []
      }),
    )
    tabBar.render(state, attention.marks(), hiddenReviews(), files)
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

  // An agent's state reaches its tab from `dck agent signal` or from its own terminal (OSC 7501)
  function applyAgentStatus(tabId: string, status: ProgramStatus) {
    connectHint.signal(tabId)
    if (status === 'idle') {
      attention.rest(tabId)
    } else {
      const event = attention.signal(tabId, status, isSeen(tabId))
      if (event) announce(event)
    }
    reviews.syncAgents()
    watchQuiet()
    showAttention()
  }

  api.agent.onSignal((signal) => {
    const tabId = tabOfPty(signal.ptyId)
    if (tabId) applyAgentStatus(tabId, signal.state)
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
      // A cd moved a tab's folder
      saveTabsSoon()
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
        {
          snapshot: () => activeSnapshot,
          requestRender: () => panel.render(),
          ticket: (branch) =>
            jiraTicketLink(
              branch,
              storedAccount(settings.current(), JIRA_CONNECTOR.id)?.url,
              viewsView.issueProjects(JIRA_CONNECTOR.id),
            ),
          openTicket: (url) => api.external.open(url),
          openModule(path) {
            if (state.activeId) reviews.showModule(showPanes(state.activeId), path)
          },
          openFile(path) {
            if (state.activeId) reviews.showFile(showPanes(state.activeId), path)
          },
          openReview() {
            if (state.activeId) reviews.show(showPanes(state.activeId))
          },
        },
        i18n,
      ),
      createEnvironmentSection({ status: () => environment }, i18n),
    ],
    afterPointer: () => focusActive(),
    i18n,
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
    saveTabsSoon()
  }

  // The fonts the system offers, read once on start and again when the settings open
  let systemFonts: SystemFontsInfo = noSystemFonts

  // A new font is loaded before any terminal measures it; every tab takes the font and the cursor at once
  async function applyTerminalLook() {
    const look = terminalLook(settings.current(), systemFonts)
    await loadFont(settings.current().fontSize, look.fontFamily)
    for (const session of sessions.values()) {
      session.setFontFamily(look.fontFamily)
      session.setCursor(look.cursorStyle, look.cursorBlink)
    }
    for (const view of tabViews.values()) view.relayout()
    applyEditorFont()
  }

  // Tabs that opened with a name of their own (a project's), which the next start gives them again
  const namedTabs = new Set<string>()
  // While the last run's tabs open one by one, there is nothing to save yet
  let restoring = false
  let lastSaved: SavedTabs | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  const projectOf = (id: string) => [...projectTabs].find(([, tabId]) => tabId === id)?.[0]

  // After every change of the tabs and every cd the watcher sees; written only when something changed
  function saveTabsSoon() {
    if (restoring || !settings.current().window.restoreTabs) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(writeTabs, SAVE_TABS_MS)
  }

  function writeTabs() {
    const next = tabsToSave(state, (id) => {
      const cwd = watcher.get(id)?.cwd
      const project = projectOf(id)
      const { file, recent } = fileTabs.saved(id)
      return {
        ...(cwd ? { cwd } : {}),
        ...(project ? { project } : {}),
        ...(file ? { file } : {}),
        recent,
        named: namedTabs.has(id),
      }
    })
    if (sameSavedTabs(lastSaved, next)) return
    lastSaved = next
    api.tabs.save(next)
  }

  // Before a restart: what is waiting for the debounce is written now
  function saveTabsNow() {
    if (restoring || !settings.current().window.restoreTabs) return
    clearTimeout(saveTimer)
    writeTabs()
  }

  // The last run's tabs, in their order, folders and names, with the one that was active; else one tab
  async function restoreTabs() {
    const saved = settings.current().window.restoreTabs ? await api.tabs.saved() : undefined
    if (!saved || saved.tabs.length === 0) {
      await open()
      return
    }
    restoring = true
    for (const tab of saved.tabs) {
      const id = await open({
        ...(tab.cwd ? { cwd: tab.cwd } : {}),
        ...(tab.label ? { label: tab.label } : {}),
        ...(tab.project ? { project: tab.project } : {}),
      })
      if (tab.name) state = renameTab(state, id, tab.name)
      void fileTabs.restore(id, tab.file, tab.recent ?? [])
    }
    restoring = false
    lastSaved = saved
    update(activateTabAt(state, Math.min(saved.active, state.tabs.length - 1)))
  }

  function update(next: TabsState) {
    if (next === state) return
    // Leaving a tab leaves its file: auto save writes it
    if (state.activeId !== undefined && state.activeId !== next.activeId)
      fileTabs.flush(state.activeId)
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
    namedTabs.delete(id)
    fileTabs.forget(id)
  }

  // A file with edits is saved first, or the user is asked; a cancel keeps the tab
  async function close(id: string) {
    if (closeTab(state, id) === state || !(await fileTabs.confirmClose(id))) return
    const next = closeTab(state, id)
    if (next === state) return
    discard(id)
    update(next)
  }

  async function closeOthers(id: string) {
    for (const tab of state.tabs)
      if (tab.id !== id && !(await fileTabs.confirmClose(tab.id))) return
    for (const tab of state.tabs) if (tab.id !== id) discard(tab.id)
    update(closeOtherTabs(state, id))
  }

  async function open(options: OpenOptions = {}): Promise<string> {
    counter += 1
    const id = `tab-${counter}`
    if (options.label) namedTabs.add(id)
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
      holdFit: () => heldFit,
      ...terminalLook(settings.current(), systemFonts),
      macOptionAsMeta: settings.current().terminal.macOptionAsMeta,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      exitedText: i18n.t('terminal.exited'),
      nativeMiddlePaste,
      keymap,
      links: {
        modifier: keymap.click.modifier,
        hint: () => ({
          key: keymap.click.label,
          gesture: { click: i18n.t('terminal.leftClick'), action: i18n.t('terminal.openLink') },
        }),
        tip: setTipRegion,
      },
      paths: {
        modifier: keymap.click.modifier,
        hint: () => ({
          key: keymap.click.label,
          gesture: { click: i18n.t('terminal.leftClick'), action: i18n.t('terminal.openPath') },
        }),
        cwd: () => watcher.get(id)?.cwd,
        openFolder: (path, x, y) => openFolderMenu(id, path, x, y),
        tip: setTipRegion,
      },
      openMenu: (x, y) => openTerminalMenu(id, x, y),
      onCopied: (text) => notice.copied(text),
      onExit: () => void close(id),
      onInput() {
        // Only the key that answers a waiting agent redraws: the rest echo with no extra work
        if (attention.input(id)) showAttention()
        watchQuiet()
      },
      onProgramStatus: (status) => applyAgentStatus(id, status),
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
    return id
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
      { pointer: true },
    )
  }

  // A Mac's secondary click in a terminal; each item shows the key the Edit menu and xterm give it
  function openTerminalMenu(tabId: string, x: number, y: number) {
    const session = sessions.get(tabId)
    if (!session) return
    menu.open(
      [
        {
          label: i18n.t('terminal.copy'),
          enabled: session.hasSelection(),
          key: keymap.commandLabel('c'),
          run: () => session.copySelection(),
        },
        {
          label: i18n.t('terminal.paste'),
          enabled: true,
          key: keymap.commandLabel('v'),
          run: () => session.pasteClipboard(),
        },
        {
          label: i18n.t('terminal.selectAll'),
          enabled: true,
          key: keymap.commandLabel('a'),
          run: () => session.selectAll(),
        },
      ],
      x,
      y,
      false,
      () => session.focus(),
      { pointer: true },
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
      fileSearch.retranslate()
      viewsView.retranslate()
      reviews.retranslate()
      for (const view of tabViews.values()) view.retranslate()
      fileTabs.retranslate()
      showWorkWaiting(workWaiting)
      updateNotice.retranslate()
      quitCard.retranslate()
      settingsView.rerender()
      renderTabs()
    }
    // The folder and depth are only read when listing: reload for the menu and the search
    if (changed.some((key) => key.startsWith('projects.'))) void refreshProjects()
    if (changed.includes('opacity')) applyOpacity(next.opacity)
    // The keymap reads the keys by itself; what drew a key's label draws it again
    if (changed.some((key) => key.startsWith('shortcuts.keys'))) reviews.keysChanged()
    if (changed.includes('system.agentConnectHint')) panel.render()
    // A connector was enabled or disabled: its tabs and the Work dot follow
    if (changed.includes('extensions.disabled')) void viewsView.warm()
    if (changed.includes('fontSize')) {
      applyEditorFont()
      for (const session of sessions.values()) session.setFontSize(next.fontSize)
    }
    if (changed.some((key) => key.startsWith('appearance.')))
      applyAppearance(document.documentElement, next.appearance)
    if (changed.includes('terminal.macOptionAsMeta')) {
      for (const session of sessions.values())
        session.setOptionAsMeta(next.terminal.macOptionAsMeta)
    }
    const look = changed.filter((key) => key !== 'terminal.macOptionAsMeta')
    if (look.some((key) => key.startsWith('terminal.'))) void applyTerminalLook()
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
      activate: (id) => update(activateTab(state, id)),
      close,
      middleClickCloses: () => !holdsMiddleButton(holdTrigger()),
      reorder: (ids) => {
        state = reorderTabs(state, ids)
        render()
      },
      rename(id, name) {
        if (name !== undefined) state = renameTab(state, id, name)
        render()
      },
      showFile(id, shown) {
        update(activateTab(state, id))
        fileTabs.show(id, shown)
      },
      fileMenu: openFileMenu,
      contextMenu(id, x, y) {
        const several = state.tabs.length > 1
        menu.open(
          [
            { label: i18n.t('tabs.close'), enabled: several, run: () => close(id) },
            { label: i18n.t('tabs.closeOthers'), enabled: several, run: () => closeOthers(id) },
            { label: i18n.t('tabs.rename'), enabled: true, run: () => tabBar.rename(id) },
            { label: i18n.t('tabs.duplicate'), enabled: true, run: () => void duplicate(id) },
            {
              label: i18n.t(reviews.isOpen(id) ? 'review.close' : 'review.toggle'),
              enabled: true,
              run: () => (reviews.isOpen(id) ? reviews.close(id) : toggleReview(id)),
            },
            ...(fileTabs.has(id)
              ? [
                  {
                    label: fileLabel(id),
                    enabled: true,
                    key: keymap.label('toggleFile'),
                    run: () => toggleFile(id),
                  },
                ]
              : []),
          ],
          x,
          y,
          !document.body.classList.contains('full'),
          // Closed with Esc or a click elsewhere, the keys go back to the terminal
          () => focusActive(),
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
    showPanes(id)
    reviews.toggle(id)
  }

  const actions = {
    newTab: () => void open(),
    toggleReview: () => state.activeId && toggleReview(state.activeId),
    toggleReviewLayout: () => state.activeId && reviews.toggleLayout(state.activeId),
    sendReview: () => void (state.activeId && reviews.send(state.activeId)),
    closeTab: () => state.activeId && close(state.activeId),
    renameTab: () => state.activeId && tabBar.rename(state.activeId),
    nextTab: () => update(stepTab(state, 1)),
    previousTab: () => update(stepTab(state, -1)),
    goToTab: (target: TabTarget) =>
      update(activateTabAt(state, target === 'last' ? state.tabs.length - 1 : target)),
    toggleTheme,
    openSettings: () => settingsView.open(),
    openViews: () => void viewsView.open(),
    searchProjects,
    searchFiles,
    togglePanel,
    toggleFullHeight: () => api.window.toggleFullHeight(),
    clearTerminal: () => activeSession()?.clear(),
    toggleFile: () => state.activeId && toggleFile(state.activeId),
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
  bindShortcuts(actions, keymap)

  const commands: Record<string, () => void> = {
    'tab:new': actions.newTab,
    'tab:close': actions.closeTab,
    'tab:rename': actions.renameTab,
    'tab:next': actions.nextTab,
    'tab:previous': actions.previousTab,
    'tab:finished': actions.nextFinished,
    'tab:review': actions.toggleReview,
    'tab:review-layout': actions.toggleReviewLayout,
    'tab:clear': actions.clearTerminal,
    'tab:file': actions.toggleFile,
    'agent:claude': () => activeSession()?.write('claude\r'),
    'agent:resume': () => activeSession()?.write('claude --resume\r'),
    [CONNECT_ITEM]: () => state.activeId && connectTab(state.activeId),
    'system:full-height': () => api.window.toggleFullHeight(),
    'system:theme': toggleTheme,
    'system:settings': () => settingsView.open(),
    'system:settings-file': () => void settings.openFile(),
    'system:panel': togglePanel,
    // The hold menu offers it only while a newer release can be taken
    'system:update': () =>
      updateNotice.current()?.canInstall ? api.updates.install() : api.updates.openRelease(),
    'project:search': searchProjects,
    'file:search': searchFiles,
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
          { id: 'tab:new', label: i18n.t('tabs.new'), shortcut: keymap.label('newTab') },
          { id: 'tab:close', label: i18n.t('tabs.close'), shortcut: keymap.label('closeTab') },
          { id: 'tab:rename', label: i18n.t('tabs.rename'), shortcut: keymap.label('renameTab') },
          { id: 'tab:next', label: i18n.t('tabs.next'), shortcut: keymap.label('nextTab') },
          {
            id: 'tab:previous',
            label: i18n.t('tabs.previous'),
            shortcut: keymap.label('previousTab'),
          },
          { id: 'tab:finished', label: i18n.t('tabs.nextFinished') },
          { id: 'tab:review', label: i18n.t('review.toggle'), shortcut: keymap.label('review') },
          {
            id: 'tab:review-layout',
            label: i18n.t('review.layout.toggle'),
            shortcut: keymap.label('reviewLayout'),
          },
          {
            id: 'tab:clear',
            label: i18n.t('terminal.clear'),
            shortcut: keymap.label('clearTerminal'),
          },
          ...(state.activeId !== undefined && fileTabs.has(state.activeId)
            ? [
                {
                  id: 'tab:file',
                  label: fileLabel(state.activeId),
                  shortcut: keymap.label('toggleFile'),
                },
              ]
            : []),
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
            shortcut: keymap.label('projects'),
          },
          {
            id: 'file:search',
            label: `${i18n.t('fileSearch.search')}…`,
            shortcut: keymap.label('fileSearch'),
          },
          { id: 'views:open', label: i18n.t('views.open'), shortcut: keymap.label('views') },
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
          {
            id: 'system:full-height',
            label: i18n.t('menu.system.fullHeight'),
            shortcut: keymap.label('fullHeight'),
          },
          {
            id: 'system:settings',
            label: i18n.t('menu.system.settings'),
            shortcut: keymap.label('settings'),
          },
          { id: 'system:settings-file', label: i18n.t('menu.system.settingsFile') },
          {
            id: 'system:panel',
            label: i18n.t('menu.system.panel'),
            shortcut: keymap.label('panel'),
          },
          {
            id: 'system:theme',
            label: i18n.t('menu.system.theme'),
            shortcut: keymap.label('theme'),
          },
          ...updateItems(),
        ],
      },
    ]
  }

  // While a newer release can be taken, dismissed or not: install it here, or read about it where it cannot
  function updateItems() {
    const update = updateNotice.current()
    if (!update?.offer) return []
    const label = update.canInstall ? 'updates.menu.install' : 'updates.menu.page'
    return [{ id: 'system:update', label: i18n.t(label, { version: update.offer }) }]
  }

  createHoldMenuController(
    { scrim: elements.scrim, card: elements.card, hint: elements.hint, bar },
    {
      categories: () => {
        void refreshProjects()
        return categories()
      },
      run(_categoryId, item) {
        if (item.id.startsWith(PROJECT_PREFIX)) openProject(item.id.slice(PROJECT_PREFIX.length))
        else commands[item.id]?.()
      },
      triggerCode: holdTrigger,
    },
    {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    i18n.t,
  )

  // While the edge is dragged the terminals keep their grid: a shell or a TUI redraws once, not every frame
  let heldFit = false
  const resizeEdge = createResizeEdge({
    edge: elements.edge,
    label: elements.edgeSize,
    bar,
    resize: (height) => api.window.resize(height),
    end: (keep) => api.window.endResize(keep),
    toggleFullHeight: () => api.window.toggleFullHeight(),
    hold: (held) => {
      heldFit = held
    },
    settle: () => {
      for (const session of sessions.values()) session.fit()
    },
  })
  // DCK_HEIGHT pins the height for the whole run, so the edge is offered or not once
  resizeEdge.setEnabled(!settings.locked().includes('window.heightRatio'))

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
  // Hiding the window leaves the files: auto save writes them
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) fileTabs.flushAll()
  })
  api.notifications.onClick((tabId) => {
    if (state.tabs.some((tab) => tab.id === tabId)) update(activateTab(state, tabId))
  })
  elements.settingsButton.addEventListener('click', () => settingsView.toggle())
  elements.viewsButton.addEventListener('click', () => viewsView.toggle())
  showWorkWaiting(0)
  void viewsView.warm()
  api.window.onShown(() => void viewsView.warm())
  api.window.onOpenSettings(() => settingsView.open())
  api.updates.onChange((update) => updateNotice.show(update))
  api.quit.onAsk((running) => quitCard.ask(running))
  // Before any quit the files are saved, or the user decides about the ones that cannot be
  api.quit.onSettleFiles(async () => {
    const quit = await fileTabs.beforeQuit({
      asking: () => api.quit.filesSettled('asking'),
      reveal: (tabId) => update(activateTab(state, tabId)),
    })
    api.quit.filesSettled(quit ? 'quit' : 'stay')
  })
  // A change that arrived first is newer than this answer
  void api.updates.state().then((update) => {
    if (!updateNotice.current()) updateNotice.show(update)
  })
  api.window.onShown(() => {
    setTimeout(markActiveSeen, 150)
    document.body.classList.remove('enter')
    void document.body.offsetWidth
    document.body.classList.add('enter')
  })

  const [, readFonts] = await Promise.all([refreshProjects(), api.fonts.system()])
  systemFonts = readFonts
  applyAppearance(document.documentElement, settings.current().appearance)
  applyEditorFont()
  await loadFont(
    settings.current().fontSize,
    terminalLook(settings.current(), systemFonts).fontFamily,
  )
  await restoreTabs()
}
