import {
  type AgentSession,
  activateTab,
  activateTabAt,
  type ComposeStatus,
  closeOtherTabs,
  closeTab,
  createAttentionTracker,
  createTranslator,
  emptyTabs,
  FONT_SIZE,
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
import type { ThemeName } from '@dck/design'
import { createHoldMenuController } from './hold-menu-controller.ts'
import { setFullHeight } from './layout-mode.ts'
import { currentLocale } from './locale.ts'
import { createNotice } from './notice.ts'
import { createAgentSection } from './panel/agent-section.ts'
import { createEnvironmentSection } from './panel/environment-section.ts'
import { createGitSection } from './panel/git-section.ts'
import { createPanel } from './panel/panel.ts'
import { createSessionsSection } from './panel/sessions-section.ts'
import {
  applyOpacity,
  loadFontSize,
  loadOpacity,
  saveFontSize,
  saveOpacity,
} from './preferences.ts'
import { createProjectSearch } from './project-search.ts'
import { createSessionWatcher } from './sessions-watcher.ts'
import { bindShortcuts } from './shortcuts.ts'
import { createTabBar } from './tab-bar.ts'
import { createTabMenu } from './tab-menu.ts'
import { createTerminalSession, type TerminalSession } from './terminal-session.ts'
import { applyTheme } from './theme.ts'

export interface AppElements {
  readonly bar: HTMLElement
  readonly host: HTMLElement
  readonly main: HTMLElement
  readonly dock: HTMLElement
  readonly panel: HTMLElement
  readonly rail: HTMLElement
  readonly split: HTMLElement
  readonly notice: HTMLElement
  readonly menu: HTMLElement
  readonly scrim: HTMLElement
  readonly card: HTMLElement
  readonly hint: HTMLElement
  readonly search: HTMLElement
  readonly searchInput: HTMLInputElement
  readonly searchResults: HTMLElement
}

interface OpenOptions {
  readonly cwd?: string
  readonly label?: string
  readonly project?: string
}

const PROJECT_PREFIX = 'open-project:'

export async function startApp(elements: AppElements, api: HostApi, initialTheme: ThemeName) {
  const { bar, host } = elements
  const sessions = new Map<string, TerminalSession>()
  const projectTabs = new Map<string, string>()
  const notice = createNotice(elements.notice, bar)
  const menu = createTabMenu(elements.menu)
  let state: TabsState = emptyTabs
  let theme = initialTheme
  let counter = 0
  let opacity = loadOpacity()
  let fontSize = loadFontSize()
  applyOpacity(opacity)
  let projects: readonly Project[] = []

  const refreshProjects = () =>
    api.projects.list().then((found) => {
      projects = found
    })

  const search = createProjectSearch(
    { overlay: elements.search, input: elements.searchInput, results: elements.searchResults },
    (path) => openProject(path),
    () => activeSession()?.focus(),
  )

  function searchProjects() {
    void refreshProjects().then(() => {
      search.open(projects.map((project) => ({ path: project.path, label: projectLabel(project) })))
    })
  }

  const activeSession = () => (state.activeId ? sessions.get(state.activeId) : undefined)

  let activeSnapshot: SessionSnapshot | undefined
  let environment: ComposeStatus | undefined
  let agentState: { session: AgentSession | undefined } | undefined
  let autoOpened = false

  const i18n = createTranslator(currentLocale())
  const attention = createAttentionTracker({ clock: { now: () => Date.now() } })

  // Visto é a aba ativa numa janela com foco; fora disso o aviso fica pendente
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
      createAgentSection({ state: () => agentState }, i18n),
      createEnvironmentSection({ status: () => environment }, i18n),
    ],
    afterPointer: () => activeSession()?.focus(),
    t: i18n.t,
    title: () => {
      const cwd = state.activeId ? watcher.get(state.activeId)?.cwd : undefined
      return cwd ? cwd.replace(/^\/(?:home|Users)\/[^/]+/, '~') : ''
    },
    refresh: async (expanded) => {
      const id = activeSession()?.ptyId
      // O Docker só é consultado com a seção aberta: é a leitura mais pesada do painel
      const [snapshot, containers, agent] = await Promise.all([
        id === undefined ? undefined : api.session.inspect(id),
        id !== undefined && expanded.includes('env') ? api.environment.inspect(id) : undefined,
        id !== undefined && expanded.includes('agent')
          ? api.agent.inspect(id).then((session) => ({ session }))
          : undefined,
      ])
      activeSnapshot = snapshot
      if (containers) environment = containers
      if (agent) agentState = agent
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
      fontSize,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      onCopied: (text) => notice.copied(text),
      onExit: () => close(id),
    })
    sessions.set(id, session)
    if (options.project) projectTabs.set(options.project, id)
    update(openTab(state, { id, label: options.label ?? `shell ${counter}` }))
  }

  function openProject(path: string) {
    api.projects.touch(path)
    // O host persiste a ordem; aqui sobe o projeto já, sem esperar a próxima leitura
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

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    for (const session of sessions.values()) session.setTheme(theme)
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

  const actions = {
    newTab: () => void open(),
    closeTab: () => state.activeId && close(state.activeId),
    nextTab: () => update(stepTab(state, 1)),
    previousTab: () => update(stepTab(state, -1)),
    goToTab: (index: number) => update(activateTabAt(state, index)),
    toggleTheme,
    searchProjects,
    togglePanel,
    toggleFullHeight: () => api.window.toggleFullHeight(),
    nextFinished() {
      const id = attention.unseenIds()[0]
      if (id) update(activateTab(state, id))
    },
    changeOpacity(direction: 1 | -1) {
      opacity = stepOpacity(opacity, direction)
      saveOpacity(opacity)
      applyOpacity(opacity)
    },
    changeFontSize(delta: number | 'reset') {
      fontSize = delta === 'reset' ? FONT_SIZE.initial : stepFontSize(fontSize, delta)
      saveFontSize(fontSize)
      for (const session of sessions.values()) session.setFontSize(fontSize)
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
    'system:panel': togglePanel,
    'project:search': searchProjects,
  }

  // Nomes repetidos ganham a pasta pai para se distinguirem na lista
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
        label: 'Abas',
        icon: 'window',
        items: [
          { id: 'tab:new', label: 'Nova aba', shortcut: 'Ctrl+Shift+T' },
          { id: 'tab:close', label: 'Fechar aba', shortcut: 'Ctrl+Shift+W' },
          { id: 'tab:next', label: 'Próxima aba', shortcut: 'Ctrl+Tab' },
          { id: 'tab:previous', label: 'Aba anterior', shortcut: 'Ctrl+Shift+Tab' },
          { id: 'tab:finished', label: 'Próxima que terminou', shortcut: 'Ctrl+Shift+J' },
        ],
      },
      {
        id: 'projects',
        label: 'Projetos',
        icon: 'folder',
        items: [
          { id: 'project:search', label: 'Buscar projeto…', shortcut: 'Ctrl+Shift+O' },
          ...projects.map((project) => ({
            id: `${PROJECT_PREFIX}${project.path}`,
            label: projectLabel(project),
          })),
        ],
      },
      {
        id: 'agent',
        label: 'Agente',
        icon: 'terminal',
        items: [
          { id: 'agent:claude', label: 'Iniciar Claude' },
          { id: 'agent:resume', label: 'Retomar conversa' },
        ],
      },
      {
        id: 'system',
        label: 'Sistema',
        icon: 'sliders',
        items: [
          { id: 'system:full-height', label: 'Altura total', shortcut: 'F11' },
          { id: 'system:panel', label: 'Painel lateral', shortcut: 'Ctrl+Shift+B' },
          { id: 'system:theme', label: 'Tema claro ou escuro', shortcut: 'Ctrl+Shift+L' },
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
    },
    {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
  )

  api.window.onFullHeightChange((full) => {
    setFullHeight(full, [bar, elements.main])
    // Em altura total sobra espaço: o painel abre sozinho e volta ao que era ao sair
    if (full && !panel.isOpen()) {
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
  api.window.onShown(() => {
    setTimeout(markActiveSeen, 150)
    document.body.classList.remove('enter')
    void document.body.offsetWidth
    document.body.classList.add('enter')
  })

  await refreshProjects()
  await open()
}
