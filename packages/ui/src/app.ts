import {
  activateTab,
  activateTabAt,
  closeOtherTabs,
  closeTab,
  emptyTabs,
  type HostApi,
  type MenuCategory,
  openTab,
  orderByRecency,
  type Project,
  recentTabs,
  recordInteraction,
  reorderTabs,
  stepTab,
  type TabsState,
} from '@dck/core'
import type { ThemeName } from '@dck/design'
import { createHoldMenuController } from './hold-menu-controller.ts'
import { setFullHeight } from './layout-mode.ts'
import { createNotice } from './notice.ts'
import { loadRecentProjects, saveRecentProjects } from './project-recency.ts'
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
  readonly scrim: HTMLElement
  readonly card: HTMLElement
  readonly hint: HTMLElement
}

interface OpenOptions {
  readonly cwd?: string
  readonly label?: string
  readonly project?: string
}

const PROJECT_PREFIX = 'project:'

export async function startApp(elements: AppElements, api: HostApi, initialTheme: ThemeName) {
  const { bar, host } = elements
  const sessions = new Map<string, TerminalSession>()
  const projectTabs = new Map<string, string>()
  const notice = createNotice(elements.notice, bar)
  const menu = createTabMenu(elements.menu)
  let state: TabsState = emptyTabs
  let theme = initialTheme
  let counter = 0
  let projects: readonly Project[] = []
  let recentProjects = loadRecentProjects()

  const refreshProjects = () =>
    api.projects.list().then((found) => {
      projects = found
    })

  const activeSession = () => (state.activeId ? sessions.get(state.activeId) : undefined)

  function render() {
    tabBar.render(state)
    for (const [id, session] of sessions) {
      session.element.classList.toggle('active', id === state.activeId)
    }
    const active = activeSession()
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
      ...(options.cwd ? { cwd: options.cwd } : {}),
      onCopied: (text) => notice.copied(text),
      onExit: () => close(id),
    })
    sessions.set(id, session)
    if (options.project) projectTabs.set(options.project, id)
    update(openTab(state, { id, label: options.label ?? `shell ${counter}` }))
  }

  function openProject(path: string) {
    recentProjects = recordInteraction(recentProjects, path)
    saveRecentProjects(recentProjects)
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
  }
  bindShortcuts(actions)

  const commands: Record<string, () => void> = {
    'tab:new': actions.newTab,
    'tab:close': actions.closeTab,
    'tab:next': actions.nextTab,
    'tab:previous': actions.previousTab,
    'agent:claude': () => activeSession()?.write('claude\r'),
    'agent:resume': () => activeSession()?.write('claude --resume\r'),
    'system:full-height': () => api.window.toggleFullHeight(),
    'system:theme': toggleTheme,
  }

  // Nomes repetidos ganham a pasta pai para se distinguirem na lista
  function projectLabel(project: Project) {
    const repeated = projects.filter((other) => other.name === project.name).length > 1
    if (!repeated) return project.name
    const parent = project.path.split('/').at(-2)
    return parent ? `${parent}/${project.name}` : project.name
  }

  function categories(): readonly MenuCategory[] {
    const byPath = new Map(projects.map((project) => [project.path, projectLabel(project)]))
    const ordered = orderByRecency([...byPath.keys()], recentProjects)
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
        ],
      },
      {
        id: 'projects',
        label: 'Projetos',
        icon: 'folder',
        items: ordered.map((path) => ({
          id: `${PROJECT_PREFIX}${path}`,
          label: byPath.get(path) ?? path,
        })),
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

  api.window.onFullHeightChange((full) => setFullHeight(full, [bar, host]))
  api.window.onShown(() => {
    document.body.classList.remove('enter')
    void document.body.offsetWidth
    document.body.classList.add('enter')
  })

  await refreshProjects()
  await open()
}
