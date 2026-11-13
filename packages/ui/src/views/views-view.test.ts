// @vitest-environment happy-dom
import {
  type Connector,
  createTranslator,
  GITLAB_CONNECTOR,
  type HostApi,
  JIRA_CONNECTOR,
  type PluralKey,
  type ViewItem,
  type ViewSnapshot,
} from '@dck/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViewsView } from './views-view.ts'

const mergeRequest = (number: number): ViewItem => ({
  kind: 'mergeRequest',
  id: `acme/backend!${number}`,
  number,
  title: `Merge request ${number}`,
  url: `https://gitlab.example.com/acme/backend/-/merge_requests/${number}`,
  project: 'acme/backend',
  author: 'bruno',
  sourceBranch: `feat/item-${number}`,
  targetBranch: 'main',
  draft: false,
  updatedAt: '2026-11-11T10:00:00Z',
  hasConflicts: false,
  openDiscussions: false,
  pipeline: 'success',
})

const task = (
  key: string,
  extra: Partial<Extract<ViewItem, { kind: 'issue' }>> = {},
): ViewItem => ({
  kind: 'issue',
  id: key,
  key,
  summary: `Task ${key}`,
  url: `https://acme.atlassian.net/browse/${key}`,
  project: 'ACME',
  type: 'Story',
  status: 'To Do',
  statusCategory: 'todo',
  updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  ...extra,
})

const snapshot = (
  view: string,
  state: ViewSnapshot['state'],
  items: ViewItem[] = [],
): ViewSnapshot => ({
  view,
  items,
  updatedAt: state === 'idle' ? 1 : undefined,
  state,
  error: undefined,
})

function setup(options: {
  connectors: readonly Connector[]
  snapshots: ViewSnapshot[]
  language?: 'en' | 'pt-BR'
}) {
  const stored = new Map(options.snapshots.map((entry) => [entry.view, entry]))
  const opened: string[] = []
  const badges: { count: number; label: PluralKey | undefined }[] = []
  const clipboard: string[] = []
  let settingsOpened = 0
  let connectors = options.connectors
  const api = {
    connections: { list: async () => connectors },
    views: {
      snapshot: async (view: string) => stored.get(view),
      refresh: async (view: string) => stored.get(view),
      onChange: () => () => undefined,
    },
    external: { open: (url: string) => void opened.push(url) },
    clipboard: { writeText: async (text: string) => void clipboard.push(text) },
  } as unknown as HostApi
  document.body.replaceChildren()
  const overlay = document.createElement('div')
  document.body.append(overlay)
  const view = createViewsView(overlay, {
    api,
    i18n: createTranslator(options.language ?? 'en'),
    onClose: () => undefined,
    openSettings: () => {
      settingsOpened += 1
    },
    onBadge: (count, label) => void badges.push({ count, label }),
  })
  const tabs = () => [...overlay.querySelectorAll('.vtab')].map((tab) => tab.textContent)
  const notice = () => {
    const element = overlay.querySelector<HTMLElement>('.vnotice')
    return element && !element.hidden ? element.textContent : ''
  }
  return {
    view,
    overlay,
    tabs,
    notice,
    opened,
    badges,
    clipboard,
    settingsOpened: () => settingsOpened,
    disableAll: () => {
      connectors = []
    },
  }
}

const press = (target: Element | null, key: string) =>
  target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

const connected = [
  snapshot('review', 'idle', [mergeRequest(41), mergeRequest(38)]),
  snapshot('mine', 'idle', []),
]
const unconnected = [snapshot('review', 'unconfigured'), snapshot('mine', 'unconfigured')]

describe('views view tabs', () => {
  it('should show the tabs of a connected connector with their counts when it is opened', async () => {
    const { view, tabs, notice } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })

    await view.open()

    expect(tabs()).toEqual(['To review2', 'Follow up0'])
    expect(notice()).toBe('')
  })

  it('should show no tab and the setup notice when nothing is connected', async () => {
    const { view, tabs, notice, overlay, settingsOpened } = setup({
      connectors: [GITLAB_CONNECTOR],
      snapshots: unconnected,
    })
    await view.open()

    overlay.querySelector<HTMLButtonElement>('.vnotice button')?.click()

    expect(tabs()).toEqual([])
    expect(notice()).toBe(
      'Account not connectedConnect an account to follow your work.Open Connections',
    )
    expect(settingsOpened()).toBe(1)
  })

  it('should leave only the title, the notice and the close button, with the Connections button focused, when nothing is connected', async () => {
    const { view, overlay } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: unconnected })

    await view.open()

    const shown = (selector: string) =>
      overlay.querySelector<HTMLElement>(selector)?.hidden === false
    expect(overlay.querySelector('.vheading')?.textContent).toBe('Work')
    expect(['.vheading', '.vtabs', '.vbar', '.phint', '.vlist'].map(shown)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ])
    expect(document.activeElement?.textContent).toBe('Open Connections')
  })

  it('should close the screen when Escape is pressed on the Connections button', async () => {
    const { view, overlay } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: unconnected })
    await view.open()

    press(document.activeElement, 'Escape')

    expect(overlay.classList.contains('open')).toBe(false)
    expect(view.isOpen()).toBe(false)
  })

  it('should show the tabs, the filter and the hints with the filter focused when an account is connected', async () => {
    const { view, overlay } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })

    await view.open()

    const shown = (selector: string) =>
      overlay.querySelector<HTMLElement>(selector)?.hidden === false
    expect(['.vheading', '.vtabs', '.vbar', '.phint'].map(shown)).toEqual([false, true, true, true])
    expect(document.activeElement).toBe(overlay.querySelector('.vinput'))
  })

  it('should show no tab and the setup notice when the only connector is disabled', async () => {
    const { view, tabs, notice } = setup({ connectors: [], snapshots: connected })

    await view.open()

    expect(tabs()).toEqual([])
    expect(notice()).toContain('Account not connected')
  })

  it('should open the selected merge request in the browser when Enter is pressed', async () => {
    const { view, overlay, opened } = setup({
      connectors: [GITLAB_CONNECTOR],
      snapshots: connected,
    })
    await view.open()

    press(overlay.querySelector('.vinput'), 'ArrowDown')
    press(overlay.querySelector('.vinput'), 'Enter')

    expect(opened).toEqual(['https://gitlab.example.com/acme/backend/-/merge_requests/38'])
  })
})

describe('views view badge', () => {
  it('should count the items of the view the connector marked for the badge when warming', async () => {
    const { view, badges } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })

    await view.warm()

    expect(badges.at(-1)).toEqual({ count: 2, label: 'views.waiting' })
  })

  it('should drop the badge when the connector is disabled and the screen warms again', async () => {
    const { view, badges, disableAll } = setup({
      connectors: [GITLAB_CONNECTOR],
      snapshots: connected,
    })
    await view.warm()
    disableAll()

    await view.warm()

    expect(badges.at(-1)).toEqual({ count: 0, label: undefined })
  })

  it('should not count a view whose account is not connected', async () => {
    const { view, badges } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: unconnected })

    await view.warm()

    expect(badges.at(-1)).toEqual({ count: 0, label: 'views.waiting' })
  })
})

const tasks = [
  task('ACME-12', {
    summary: 'Add rate limiting to the public API',
    status: 'In Progress',
    statusCategory: 'progress',
    type: 'Bug',
  }),
  task('ACME-9', { summary: 'Write the onboarding guide' }),
  task('OPS-3', { summary: 'Rotate the staging certificates', status: 'Waiting for review' }),
]
const jiraOnly = [...unconnected, snapshot('tasks', 'idle', tasks)]
const both = [...connected, snapshot('tasks', 'idle', tasks)]
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function openTasks(snapshots: ViewSnapshot[] = jiraOnly) {
  const context = setup({ connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR], snapshots })
  await context.view.open()
  const input = context.overlay.querySelector<HTMLInputElement>('.vinput')
  if (snapshots === both) {
    press(input, 'ArrowLeft')
    await settle()
  }
  const rows = () => [...context.overlay.querySelectorAll<HTMLElement>('.vrow')]
  const type = (value: string) => {
    if (!input) return
    input.value = value
    input.dispatchEvent(new Event('input'))
  }
  const ctrl = (key: string) =>
    input?.dispatchEvent(
      new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }),
    )
  return { ...context, input, rows, type, ctrl }
}

describe('tasks tab', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should show only Tasks when Jira is the only connected account', async () => {
    const { tabs } = await openTasks()

    expect(tabs()).toEqual(['Tasks3'])
  })

  it('should show the merge request tabs and then Tasks when both accounts are connected', async () => {
    const { tabs, overlay } = await openTasks(both)

    expect(tabs()).toEqual(['To review2', 'Follow up0', 'Tasks3'])
    expect(overlay.querySelector('.vtab[aria-selected="true"]')?.textContent).toBe('Tasks3')
  })

  it('should draw the summary, the key, the type, the age and the status of a task in its row', async () => {
    const { rows } = await openTasks()

    const [first, second] = rows()

    expect(first?.querySelector('.vtitle')?.textContent).toBe('Add rate limiting to the public API')
    expect(first?.querySelector('.vref')?.textContent).toBe('ACME-12')
    expect(first?.querySelector('.vmeta')?.textContent).toBe('ACME-12Bug · 2 h ago')
    expect(first?.querySelector('.vstate')?.textContent).toBe('In Progress')
    expect(first?.querySelector('.vstate')?.getAttribute('data-category')).toBe('progress')
    expect(second?.querySelector('.vstate')?.getAttribute('data-category')).toBe('todo')
    expect(first?.querySelector('.vflag')).toBeNull()
    expect(first?.getAttribute('aria-label')).toBe(
      'ACME-12 Add rate limiting to the public API, In Progress',
    )
  })

  it.each([
    ['the key', 'OPS-', ['OPS-3']],
    ['the summary', 'onboarding', ['ACME-9']],
    ['the type', 'bug', ['ACME-12']],
    ['the status', 'waiting', ['OPS-3']],
  ])('should keep only the matching tasks when filtering by %s', async (_label, query, keys) => {
    const { rows, type } = await openTasks()

    type(query)

    expect(rows().map((row) => row.querySelector('.vref')?.textContent)).toEqual(keys)
  })

  it('should say what the filter matches on this tab when it is open', async () => {
    const { input } = await openTasks()

    expect(input?.placeholder).toBe('Filter by key, summary, type or status')
    expect(input?.getAttribute('aria-label')).toBe('Filter by key, summary, type or status')
  })

  it('should copy the key of the selected task and say so in the header when Ctrl+C is pressed', async () => {
    const { input, ctrl, clipboard, overlay } = await openTasks()
    press(input, 'ArrowDown')

    ctrl('c')
    await settle()

    const status = overlay.querySelector('.vstatus')
    expect(clipboard).toEqual(['ACME-9'])
    expect(status?.textContent).toBe('Copied ACME-9')
    expect(status?.getAttribute('role')).toBe('status')
  })

  it('should go back to the update time in the header two seconds after copying', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { ctrl, overlay } = await openTasks()
    const status = () => overlay.querySelector('.vstatus')?.textContent
    const before = status()

    ctrl('c')
    await vi.advanceTimersByTimeAsync(0)
    const during = status()
    await vi.advanceTimersByTimeAsync(2000)

    expect(during).toBe('Copied ACME-12')
    expect(status()).toBe(before)
    expect(before).toContain('Updated')
  })

  it('should leave Ctrl+C to the filter when text is selected in it', async () => {
    const { input, ctrl, type, clipboard } = await openTasks()
    type('ACME')
    input?.setSelectionRange(0, 4)

    const handled = !ctrl('c')
    await settle()

    expect(handled).toBe(false)
    expect(clipboard).toEqual([])
  })

  it('should copy the key without opening the task when the key is clicked', async () => {
    const { rows, clipboard, opened, overlay } = await openTasks()

    rows()[2]?.querySelector<HTMLElement>('.vref')?.click()
    await settle()

    expect(clipboard).toEqual(['OPS-3'])
    expect(overlay.querySelector('.vstatus')?.textContent).toBe('Copied OPS-3')
    expect(opened).toEqual([])
    expect(rows()[2]?.getAttribute('aria-selected')).toBe('true')
  })

  it('should not copy anything when Ctrl+C is pressed on a merge request tab', async () => {
    const context = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })
    await context.view.open()

    context.overlay
      .querySelector('.vinput')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }),
      )
    await settle()

    expect(context.clipboard).toEqual([])
  })

  it('should open the selected task in the browser when Enter is pressed', async () => {
    const { input, opened } = await openTasks()

    press(input, 'ArrowDown')
    press(input, 'Enter')

    expect(opened).toEqual(['https://acme.atlassian.net/browse/ACME-9'])
  })

  it('should hide Needs attention and ignore Ctrl+P on the tasks tab', async () => {
    const { overlay, ctrl, rows } = await openTasks()

    ctrl('p')

    expect(overlay.querySelector<HTMLElement>('.vbar .vbtn')?.hidden).toBe(true)
    expect(rows()).toHaveLength(3)
  })

  it('should keep every task when Needs attention was on in a merge request tab', async () => {
    const context = await openTasks(both)
    press(context.input, 'ArrowRight')
    await settle()
    context.ctrl('p')

    press(context.input, 'ArrowLeft')
    await settle()

    expect(context.rows()).toHaveLength(3)
  })

  it('should show the copy hint only on the tasks tab', async () => {
    const context = await openTasks(both)
    const hints = () => context.overlay.querySelector('.phint')?.textContent ?? ''

    const onTasks = hints()
    press(context.input, 'ArrowRight')
    await settle()

    expect(onTasks).toContain('Ctrl+C copy key')
    expect(hints()).not.toContain('Ctrl+C')
  })

  it('should leave the switch hint out when Tasks is the only tab', async () => {
    const { overlay } = await openTasks()

    expect(overlay.querySelector('.phint')?.textContent).not.toContain('switch view')
  })

  it('should say that no task is assigned when the list is empty', async () => {
    const { notice } = await openTasks([...unconnected, snapshot('tasks', 'idle', [])])

    expect(notice()).toBe('No open tasks assigned to you.')
  })
})

describe('views view tab groups', () => {
  // What the header shows in order: a group label in brackets, then its tabs
  const header = (overlay: HTMLElement) =>
    [...overlay.querySelectorAll<HTMLElement>('.vtabs > *')].map((element) =>
      element.classList.contains('vgroup') ? `[${element.textContent}]` : element.textContent,
    )
  const tabNames = (overlay: HTMLElement) =>
    [...overlay.querySelectorAll('.vtab')].map((tab) => tab.getAttribute('aria-label'))
  const selectedName = (overlay: HTMLElement) =>
    overlay.querySelector('.vtab[aria-selected="true"]')?.getAttribute('aria-label')
  const gitlabOnly = [...connected, snapshot('tasks', 'unconfigured')]

  it('should put the name of each connected service before its tabs when both are connected', async () => {
    const { view, overlay } = setup({
      connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR],
      snapshots: both,
    })

    await view.open()

    expect(header(overlay)).toEqual(['[GitLab]', 'To review2', 'Follow up0', '[Jira]', 'Tasks3'])
  })

  it('should order the groups as the connectors are declared when Jira comes first', async () => {
    const { view, overlay } = setup({
      connectors: [JIRA_CONNECTOR, GITLAB_CONNECTOR],
      snapshots: both,
    })

    await view.open()

    expect(header(overlay)).toEqual(['[Jira]', 'Tasks3', '[GitLab]', 'To review2', 'Follow up0'])
  })

  it.each([
    ['Jira', jiraOnly, ['[Jira]', 'Tasks3']],
    ['GitLab', gitlabOnly, ['[GitLab]', 'To review2', 'Follow up0']],
  ])(
    'should still name the service when %s is the only one connected',
    async (_name, snapshots, expected) => {
      const { view, overlay } = setup({ connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR], snapshots })

      await view.open()

      expect(header(overlay)).toEqual(expected)
    },
  )

  it('should expose only tabs in the tablist and name the service in each tab when both are connected', async () => {
    const { view, overlay } = setup({
      connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR],
      snapshots: both,
    })

    await view.open()

    const exposed = [...(overlay.querySelector('.vtabs')?.children ?? [])].filter(
      (element) => element.getAttribute('aria-hidden') !== 'true',
    )
    expect(exposed.map((element) => element.getAttribute('role'))).toEqual(['tab', 'tab', 'tab'])
    expect(tabNames(overlay)).toEqual([
      'GitLab, To review, 2',
      'GitLab, Follow up, 0',
      'Jira, Tasks, 3',
    ])
    expect(overlay.querySelector('.vgroup')?.tagName).toBe('SPAN')
    expect(overlay.querySelector('.vgroup')?.hasAttribute('tabindex')).toBe(false)
  })

  it('should describe each list in the tooltip of its tab from the connector declaration', async () => {
    const { view, overlay } = setup({
      connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR],
      snapshots: both,
    })

    await view.open()

    const tabs = [...overlay.querySelectorAll('.vtab')]
    expect(tabs.map((tab) => tab.getAttribute('data-tip'))).toEqual([
      'Merge requests waiting for your review',
      'Merge requests you opened',
      'Jira issues assigned to you',
    ])
    expect(tabs.map((tab) => tab.getAttribute('aria-description'))).toEqual(
      tabs.map((tab) => tab.getAttribute('data-tip')),
    )
    expect(tabs.some((tab) => tab.hasAttribute('title'))).toBe(false)
  })

  it('should move across the groups and wrap around when ← and → are pressed', async () => {
    const { view, overlay } = setup({
      connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR],
      snapshots: both,
    })
    await view.open()
    const input = overlay.querySelector('.vinput')
    const visited: (string | null | undefined)[] = []

    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']) {
      press(input, key)
      await settle()
      visited.push(selectedName(overlay))
    }

    expect(visited).toEqual([
      'GitLab, Follow up, 0',
      'Jira, Tasks, 3',
      'GitLab, To review, 2',
      'Jira, Tasks, 3',
    ])
  })

  it('should name the tabs, their tooltips and the groups in Portuguese when the language is pt-BR', async () => {
    const { view, overlay } = setup({
      connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR],
      snapshots: both,
      language: 'pt-BR',
    })

    await view.open()

    expect(header(overlay)).toEqual(['[GitLab]', 'Revisar2', 'Acompanhar0', '[Jira]', 'Tarefas3'])
    expect(tabNames(overlay)).toEqual([
      'GitLab, Revisar, 2',
      'GitLab, Acompanhar, 0',
      'Jira, Tarefas, 3',
    ])
    expect(
      [...overlay.querySelectorAll('.vtab')].map((tab) => tab.getAttribute('data-tip')),
    ).toEqual([
      'MRs que aguardam a sua review',
      'MRs que você abriu',
      'Issues do Jira atribuídas a você',
    ])
  })
})

// Tasks across projects, as the tracker sends them: most recently updated first
const tracked = (
  key: string,
  category: 'todo' | 'progress',
  extra: Partial<Extract<ViewItem, { kind: 'issue' }>> = {},
) =>
  task(key, {
    project: key.split('-')[0] ?? '',
    statusCategory: category,
    status: category === 'progress' ? 'In Progress' : 'To Do',
    ...extra,
  })
const spread = [
  tracked('NTF-41', 'todo', { summary: 'Retry the failed webhooks' }),
  tracked('BID-7', 'progress', { summary: 'Fix the build cache', type: 'Task' }),
  tracked('NTF-39', 'todo', { summary: 'Corrigir o deploy de homologação' }),
  tracked('NTF-397', 'progress', { summary: 'Send the daily digest' }),
  tracked('PLTB-3', 'todo', { summary: 'Login fails on Safari', type: 'Bug' }),
  tracked('NTF-12', 'todo', { summary: 'Rename the digest template' }),
]

async function openSpread(items: ViewItem[] = spread, language: 'en' | 'pt-BR' = 'en') {
  const context = setup({
    connectors: [JIRA_CONNECTOR],
    snapshots: [snapshot('tasks', 'idle', items)],
    language,
  })
  await context.view.open()
  const overlay = context.overlay
  const input = overlay.querySelector<HTMLInputElement>('.vinput')
  const keys = () =>
    [...overlay.querySelectorAll('.vrow .vref')].map((element) => element.textContent)
  const heads = () =>
    [...overlay.querySelectorAll('.vsection-head')].map((element) => element.textContent)
  const selectedKey = () => overlay.querySelector('.vrow[aria-selected="true"] .vref')?.textContent
  const chips = () =>
    [...overlay.querySelectorAll<HTMLButtonElement>('.vprojects button')].map(
      (button) =>
        `${button.textContent}${button.getAttribute('aria-pressed') === 'true' ? '*' : ''}`,
    )
  const chip = (project: string) =>
    overlay.querySelector<HTMLButtonElement>(`.vprojects button[data-project="${project}"]`)
  const type = (value: string) => {
    if (!input) return
    input.value = value
    input.dispatchEvent(new Event('input'))
  }
  return { ...context, input, keys, heads, selectedKey, chips, chip, type }
}

describe('tasks grouped by progress', () => {
  it('should list In progress before To do with their counts, keeping the list order in each', async () => {
    const { keys, heads } = await openSpread()

    expect(heads()).toEqual(['In progress2', 'To do4'])
    expect(keys()).toEqual(['BID-7', 'NTF-397', 'NTF-41', 'NTF-39', 'PLTB-3', 'NTF-12'])
  })

  it('should expose each section as a labelled group and count only tasks in the positions', async () => {
    const { overlay } = await openSpread()

    const groups = [...overlay.querySelectorAll('.vlist [role="group"]')]
    const rows = [...overlay.querySelectorAll('.vrow')]

    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'In progress, 2',
      'To do, 4',
    ])
    expect(groups[1]?.querySelectorAll('[role="option"]')).toHaveLength(4)
    expect(
      [...overlay.querySelectorAll('.vsection-head')].map((head) =>
        head.getAttribute('aria-hidden'),
      ),
    ).toEqual(['true', 'true'])
    expect(rows.map((row) => row.getAttribute('aria-posinset'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ])
    expect(new Set(rows.map((row) => row.getAttribute('aria-setsize')))).toEqual(new Set(['6']))
  })

  it('should skip the headers when ↓ and ↑ cross from one section to the other', async () => {
    const { input, selectedKey } = await openSpread()
    const visited: (string | null | undefined)[] = []

    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp']) {
      press(input, key)
      visited.push(selectedKey())
    }

    expect(visited).toEqual(['NTF-397', 'NTF-41', 'NTF-397'])
  })

  it('should go to the last and the first task when End and Home are pressed with an empty filter', async () => {
    const { input, selectedKey } = await openSpread()

    press(input, 'End')
    const last = selectedKey()
    press(input, 'Home')

    expect(last).toBe('NTF-12')
    expect(selectedKey()).toBe('BID-7')
  })

  it('should leave Home and End to the text when the filter has some', async () => {
    const { input, type, selectedKey } = await openSpread()
    type('the')

    const handled = !press(input, 'End')

    expect(handled).toBe(false)
    expect(selectedKey()).toBe('BID-7')
  })

  it('should hide a section when none of its tasks is in the list', async () => {
    const { heads, type } = await openSpread()

    type('safari')

    expect(heads()).toEqual(['To do1'])
  })

  it('should keep the sections and their counts when filtering', async () => {
    const { heads, keys, type } = await openSpread()

    type('digest')

    expect(heads()).toEqual(['In progress1', 'To do1'])
    expect(keys()).toEqual(['NTF-397', 'NTF-12'])
  })

  it('should name the sections in Portuguese when the language is pt-BR', async () => {
    const { heads } = await openSpread(spread, 'pt-BR')

    expect(heads()).toEqual(['Em andamento2', 'A fazer4'])
  })

  it('should draw only the rows in view when the list has a thousand tasks', async () => {
    const many = Array.from({ length: 1000 }, (_, index) =>
      tracked(`NTF-${index + 1}`, index % 3 === 0 ? 'progress' : 'todo'),
    )

    const { overlay } = await openSpread(many)

    const height = Number.parseFloat(
      overlay.querySelector<HTMLElement>('.vinner')?.style.height ?? '',
    )
    expect(overlay.querySelectorAll('.vrow').length).toBeLessThan(30)
    expect(height).toBe(2 * 32 + 1000 * 46)
  })
})

describe('tasks quick filter by project', () => {
  it('should offer the projects of the list with their counts, most frequent first', async () => {
    const { chips, overlay } = await openSpread()

    const group = overlay.querySelector('.vprojects')

    expect(chips()).toEqual(['NTF4', 'BID1', 'PLTB1'])
    expect(group?.getAttribute('role')).toBe('group')
    expect(group?.getAttribute('aria-label')).toBe('Projects')
    expect(overlay.querySelector('.vprojects button')?.getAttribute('data-tip')).toBe(
      'Show only the tasks of NTF',
    )
  })

  it('should keep only the tasks of a project when its toggle is clicked, and all again on a second click', async () => {
    const { chip, chips, keys } = await openSpread()

    chip('NTF')?.click()
    const chosen = { chips: chips(), keys: keys() }
    chip('NTF')?.click()

    expect(chosen).toEqual({
      chips: ['NTF4*', 'BID1', 'PLTB1'],
      keys: ['NTF-397', 'NTF-41', 'NTF-39', 'NTF-12'],
    })
    expect(chips()).toEqual(['NTF4', 'BID1', 'PLTB1'])
    expect(keys()).toHaveLength(6)
  })

  it('should keep one project at a time when another toggle is clicked', async () => {
    const { chip, chips, keys } = await openSpread()

    chip('NTF')?.click()
    chip('PLTB')?.click()

    expect(chips()).toEqual(['NTF4', 'BID1', 'PLTB1*'])
    expect(keys()).toEqual(['PLTB-3'])
  })

  it('should combine the project with the text filter and say when nothing is left', async () => {
    const { chip, keys, type, notice } = await openSpread()
    chip('NTF')?.click()

    type('digest')
    const found = keys()
    type('safari')

    expect(found).toEqual(['NTF-397', 'NTF-12'])
    expect(keys()).toEqual([])
    expect(notice()).toBe('Nothing found.')
  })

  it('should show no toggle when every task is of the same project', async () => {
    const { overlay } = await openSpread([tracked('NTF-1', 'todo'), tracked('NTF-2', 'progress')])

    expect(overlay.querySelector<HTMLElement>('.vprojects')?.hidden).toBe(true)
  })

  it('should offer at most six projects when the list has more', async () => {
    const projects = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG']

    const { chips } = await openSpread(projects.map((project) => tracked(`${project}-1`, 'todo')))

    expect(chips()).toEqual(['AAA1', 'BBB1', 'CCC1', 'DDD1', 'EEE1', 'FFF1'])
  })

  it('should keep the focus on the toggle when it is pressed from the keyboard', async () => {
    const { chip, chips } = await openSpread()
    chip('BID')?.focus()

    chip('BID')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))

    expect(chips()).toEqual(['NTF4', 'BID1*', 'PLTB1'])
    expect(document.activeElement).toBe(chip('BID'))
  })

  it('should give the focus back to the filter when a toggle is clicked with the mouse', async () => {
    const { chip, input } = await openSpread()

    chip('BID')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))

    expect(document.activeElement).toBe(input)
  })

  it('should clear the chosen project when the screen closes', async () => {
    const { chip, chips, view } = await openSpread()
    chip('NTF')?.click()

    view.close()
    await view.open()

    expect(chips()).toEqual(['NTF4', 'BID1', 'PLTB1'])
  })

  it('should show no project toggle on a merge request tab', async () => {
    const { view, overlay } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })

    await view.open()

    expect(overlay.querySelector<HTMLElement>('.vprojects')?.hidden).toBe(true)
  })
})

describe('work list search', () => {
  it('should not match the middle of a word when typing bug', async () => {
    const { keys, type } = await openSpread()

    type('bug')

    expect(keys()).toEqual(['PLTB-3'])
  })

  it('should find accented text when typed without accents', async () => {
    const { keys, type } = await openSpread()

    type('homologacao')

    expect(keys()).toEqual(['NTF-39'])
  })

  it('should select the exact key even when it sits in a later section', async () => {
    const { keys, type, selectedKey } = await openSpread()

    type('NTF-39')

    expect(keys()).toEqual(['NTF-397', 'NTF-39'])
    expect(selectedKey()).toBe('NTF-39')
  })

  it('should search merge requests by the start of their words too', async () => {
    const { view, overlay } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })
    await view.open()
    const input = overlay.querySelector<HTMLInputElement>('.vinput')
    const titles = () =>
      [...overlay.querySelectorAll('.vrow .vtitle')].map((element) => element.textContent)

    if (input) {
      input.value = 'request 4'
      input.dispatchEvent(new Event('input'))
    }

    expect(titles()).toEqual(['Merge request 41'])
  })
})
