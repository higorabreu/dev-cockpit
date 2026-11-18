// @vitest-environment happy-dom
import {
  type Connector,
  createTranslator,
  GITHUB_CONNECTOR,
  GITLAB_CONNECTOR,
  type HostApi,
  JIRA_CONNECTOR,
  type ViewItem,
  type ViewSnapshot,
} from '@dck/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createKeymap } from '../platform/keymap.ts'
import { HEADER_HEIGHT, ROW_HEIGHT } from './list-layout.ts'
import { createSeenMarks } from './seen-marks.ts'
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
  const waiting: number[] = []
  const storedMarks = new Map<string, string>()
  const clipboard: string[] = []
  const refreshed: string[] = []
  let itemChanges = 0
  let settingsOpened = 0
  let connectors = options.connectors
  const api = {
    connections: { list: async () => connectors },
    views: {
      snapshot: async (view: string) => stored.get(view),
      refresh: async (view: string) => {
        refreshed.push(view)
        return stored.get(view)
      },
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
    keymap: createKeymap('pc'),
    onClose: () => undefined,
    openSettings: () => {
      settingsOpened += 1
    },
    onWaiting: (count) => void waiting.push(count),
    seen: createSeenMarks({
      getItem: (key) => storedMarks.get(key) ?? null,
      setItem: (key, value) => void storedMarks.set(key, value),
    }),
    onItems: () => {
      itemChanges += 1
    },
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
    waiting,
    clipboard,
    refreshed,
    itemChanges: () => itemChanges,
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

  it('should reserve the scrollbar strip on both sides of the list so its rows stay centred', async () => {
    const { view, overlay } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })

    await view.open()

    expect(overlay.querySelector('.vlist')?.className).toBe('vlist scroll scroll-edges')
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

describe('views view waiting count', () => {
  it('should count the items of the view the connector marked for the Work dot when warming', async () => {
    const { view, waiting } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })

    await view.warm()

    expect(waiting.at(-1)).toBe(2)
  })

  it('should count nothing when the connector is disabled and the screen warms again', async () => {
    const { view, waiting, disableAll } = setup({
      connectors: [GITLAB_CONNECTOR],
      snapshots: connected,
    })
    await view.warm()
    disableAll()

    await view.warm()

    expect(waiting.at(-1)).toBe(0)
  })

  it('should not count a view whose account is not connected', async () => {
    const { view, waiting } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: unconnected })

    await view.warm()

    expect(waiting.at(-1)).toBe(0)
  })
  it('should add the user own merge requests whose CI failed when warming', async () => {
    const failed = { ...mergeRequest(7), pipeline: 'failed' } as ViewItem
    const { view, waiting } = setup({
      connectors: [GITLAB_CONNECTOR],
      snapshots: [
        connected[0] as ViewSnapshot,
        snapshot('mine', 'idle', [failed, mergeRequest(8)]),
      ],
    })

    await view.warm()

    expect(waiting.at(-1)).toBe(3)
  })

  it('should stop counting an open discussion when the user opens the tab that lists it', async () => {
    const discussed = { ...mergeRequest(7), openDiscussions: true } as ViewItem
    const { view, waiting, overlay } = setup({
      connectors: [GITLAB_CONNECTOR],
      snapshots: [connected[0] as ViewSnapshot, snapshot('mine', 'idle', [discussed])],
    })
    await view.warm()
    const before = waiting.at(-1)
    await view.open()

    press(overlay.querySelector('.vinput'), 'ArrowRight')

    expect(before).toBe(3)
    expect(waiting.at(-1)).toBe(2)
  })

  it('should not mark the user own merge requests as seen when the review tab is the open one', async () => {
    const discussed = { ...mergeRequest(7), openDiscussions: true } as ViewItem
    const { view, waiting } = setup({
      connectors: [GITLAB_CONNECTOR],
      snapshots: [connected[0] as ViewSnapshot, snapshot('mine', 'idle', [discussed])],
    })

    await view.open()

    expect(waiting.at(-1)).toBe(3)
  })
})

describe('views view with GitHub', () => {
  const pullRequest = (number: number): ViewItem => ({
    ...(mergeRequest(number) as Extract<ViewItem, { kind: 'mergeRequest' }>),
    id: `acme/backend#${number}`,
    url: `https://github.example.com/acme/backend/pull/${number}`,
    referenceMark: '#',
  })
  const github = [
    snapshot('github-review', 'idle', [pullRequest(7)]),
    snapshot('github-mine', 'idle', [pullRequest(9), pullRequest(8)]),
  ]
  const githubOnly = [...github, ...unconnected]

  it('should count the GitHub reviews and refresh both counted views when GitHub is the only one connected', async () => {
    const { view, waiting, refreshed } = setup({
      connectors: [GITHUB_CONNECTOR, GITLAB_CONNECTOR],
      snapshots: githubOnly,
    })

    await view.warm()

    expect(waiting.at(-1)).toBe(1)
    expect(refreshed).toEqual(['github-review', 'github-mine', 'review', 'mine'])
  })

  it('should sum the reviews of both services when both are connected', async () => {
    const { view, waiting } = setup({
      connectors: [GITHUB_CONNECTOR, GITLAB_CONNECTOR],
      snapshots: [...github, ...connected],
    })

    await view.warm()

    expect(waiting.at(-1)).toBe(3)
  })

  it('should count only the GitLab reviews when GitLab is the only one connected', async () => {
    const { view, waiting } = setup({
      connectors: [GITHUB_CONNECTOR, GITLAB_CONNECTOR],
      snapshots: [
        snapshot('github-review', 'unconfigured'),
        snapshot('github-mine', 'unconfigured'),
        ...connected,
      ],
    })

    await view.warm()

    expect(waiting.at(-1)).toBe(2)
  })

  it('should write the pull request reference with # and open it when Enter is pressed', async () => {
    const { view, overlay, opened } = setup({
      connectors: [GITHUB_CONNECTOR],
      snapshots: github,
    })

    await view.open()
    press(overlay.querySelector('.vinput'), 'Enter')

    expect(overlay.querySelector('.vrow .vref')?.textContent).toBe('acme/backend#7')
    expect(opened).toEqual(['https://github.example.com/acme/backend/pull/7'])
  })

  it('should say checks on a GitHub row and pipeline on a GitLab row when the CI is not green', async () => {
    const ci = (item: ViewItem, pipeline: 'failed' | 'running' | 'pending' | 'canceled') =>
      ({ ...item, pipeline }) as ViewItem
    const states = ['failed', 'running', 'pending', 'canceled'] as const
    const { view, overlay } = setup({
      connectors: [GITHUB_CONNECTOR, GITLAB_CONNECTOR],
      snapshots: [
        snapshot(
          'github-review',
          'idle',
          states.map((state, index) => ci(pullRequest(index + 1), state)),
        ),
        snapshot('github-mine', 'idle', []),
        snapshot(
          'review',
          'idle',
          states.map((state, index) => ci(mergeRequest(index + 1), state)),
        ),
        snapshot('mine', 'idle', []),
      ],
    })
    const flags = () =>
      [...overlay.querySelectorAll('.vrow .vflag-text')].map((flag) => flag.textContent)

    await view.open()
    const github = flags()
    press(overlay.querySelector('.vinput'), 'ArrowRight')
    press(overlay.querySelector('.vinput'), 'ArrowRight')
    const gitlab = flags()

    expect(github).toEqual(['Checks failed', 'Checks running', 'Checks queued', 'Checks canceled'])
    expect(gitlab).toEqual([
      'Pipeline failed',
      'Pipeline running',
      'Pipeline queued',
      'Pipeline canceled',
    ])
    expect(overlay.querySelector('.vrow')?.textContent).toContain('Pipeline failed')
  })

  it('should say checks in Portuguese on a GitHub row when the language is pt-BR', async () => {
    const failing = { ...(pullRequest(3) as object), pipeline: 'failed' } as ViewItem
    const { view, overlay } = setup({
      connectors: [GITHUB_CONNECTOR],
      snapshots: [
        snapshot('github-review', 'idle', [failing]),
        snapshot('github-mine', 'idle', []),
      ],
      language: 'pt-BR',
    })

    await view.open()

    expect(overlay.querySelector('.vrow .vflag-text')?.textContent).toBe('Checks com falha')
  })

  it('should show only the connected GitLab tabs when GitHub is not connected', async () => {
    const { view, overlay } = setup({
      connectors: [GITHUB_CONNECTOR, GITLAB_CONNECTOR],
      snapshots: [
        snapshot('github-review', 'unconfigured'),
        snapshot('github-mine', 'unconfigured'),
        ...connected,
      ],
    })

    await view.open()

    expect(
      [...overlay.querySelectorAll('.vgroup, .vtab')].map((element) => element.textContent),
    ).toEqual(['GitLab', 'To review2', 'Follow up0'])
  })

  it('should group the GitHub tabs under its name and describe them as pull requests', async () => {
    const { view, overlay } = setup({
      connectors: [GITHUB_CONNECTOR, GITLAB_CONNECTOR],
      snapshots: [...github, ...connected],
    })

    await view.open()

    const labels = [...overlay.querySelectorAll('.vtab')].map((tab) =>
      tab.getAttribute('aria-label'),
    )
    expect(labels).toEqual([
      'GitHub, To review, 1',
      'GitHub, Follow up, 2',
      'GitLab, To review, 2',
      'GitLab, Follow up, 0',
    ])
    expect(overlay.querySelector('.vtab')?.getAttribute('data-tip')).toBe(
      'Pull requests waiting for your review',
    )
  })
})

describe('views view issue projects', () => {
  const jiraTasks = [snapshot('tasks', 'idle', [task('ACME-1'), task('OPS-2', { project: 'OPS' })])]

  it('should give the projects of the stored Jira tasks without fetching them when warming', async () => {
    const { view, refreshed, itemChanges } = setup({
      connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR],
      snapshots: [...connected, ...jiraTasks],
    })

    await view.warm()

    expect([...view.issueProjects('jira')]).toEqual(['ACME', 'OPS'])
    expect(refreshed).toEqual(['review', 'mine'])
    expect(itemChanges()).toBeGreaterThan(0)
  })

  it('should give no project when the Jira account is not connected', async () => {
    const { view } = setup({
      connectors: [JIRA_CONNECTOR],
      snapshots: [snapshot('tasks', 'unconfigured', [task('ACME-1')])],
    })

    await view.warm()

    expect(view.issueProjects('jira').size).toBe(0)
  })

  it('should give no project of another connector when asked for one connector', async () => {
    const { view } = setup({ connectors: [JIRA_CONNECTOR], snapshots: jiraTasks })

    await view.warm()

    expect(view.issueProjects('gitlab').size).toBe(0)
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
      'MRs que aguardam a sua revisão',
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
  const projectButton = () => overlay.querySelector<HTMLButtonElement>('#views-project')
  const projectShown = () => projectButton()?.querySelector('[data-current]')?.textContent
  const openProjects = () => projectButton()?.click()
  const projectOptions = () =>
    [...overlay.querySelectorAll('#views-project-list [role="option"]')].map(
      (option) =>
        `${option.querySelector('.select-label')?.textContent} ${option.querySelector('.select-detail')?.textContent}`,
    )
  const pickProject = (label: string) => {
    openProjects()
    const option = [
      ...overlay.querySelectorAll<HTMLElement>('#views-project-list [role="option"]'),
    ].find((element) => element.querySelector('.select-label')?.textContent === label)
    option?.click()
  }
  const type = (value: string) => {
    if (!input) return
    input.value = value
    input.dispatchEvent(new Event('input'))
  }
  return {
    ...context,
    input,
    keys,
    heads,
    selectedKey,
    type,
    projectButton,
    projectShown,
    openProjects,
    projectOptions,
    pickProject,
  }
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
    expect(height).toBe(2 * HEADER_HEIGHT + 1000 * ROW_HEIGHT)
  })
})

describe('tasks project select', () => {
  it('should offer all projects with the total, then every project with its count, most frequent first', async () => {
    const { openProjects, projectOptions, projectShown } = await openSpread()

    openProjects()

    expect(projectShown()).toBe('All projects')
    expect(projectOptions()).toEqual(['All projects 6', 'NTF 4', 'BID 1', 'PLTB 1'])
  })

  it('should list every project however many there are', async () => {
    const projects = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'PLATFORMUI']
    const { openProjects, projectOptions } = await openSpread(
      projects.map((project) => tracked(`${project}-1`, 'todo')),
    )

    openProjects()

    expect(projectOptions()).toHaveLength(projects.length + 1)
    expect(projectOptions().at(-1)).toBe('PLATFORMUI 1')
  })

  it('should be named Project for assistive technology and sit right after the filter', async () => {
    const { projectButton, overlay } = await openSpread()

    const labelId = projectButton()?.getAttribute('aria-labelledby') ?? ''

    expect(document.getElementById(labelId)?.textContent).toBe('Project')
    expect(projectButton()?.getAttribute('role')).toBe('combobox')
    expect(
      overlay.querySelector('.vinput')?.nextElementSibling?.classList.contains('vproject'),
    ).toBe(true)
  })

  it('should keep only the tasks of the picked project and give the focus back to the filter', async () => {
    const { pickProject, projectShown, keys, input } = await openSpread()

    pickProject('NTF')

    expect(projectShown()).toBe('NTF')
    expect(keys()).toEqual(['NTF-397', 'NTF-41', 'NTF-39', 'NTF-12'])
    expect(document.activeElement).toBe(input)
  })

  it('should show every task again when All projects is picked', async () => {
    const { pickProject, keys } = await openSpread()
    pickProject('NTF')

    pickProject('All projects')

    expect(keys()).toHaveLength(6)
  })

  it('should pick a project with the keyboard alone when it has the focus', async () => {
    const { projectButton, keys, input } = await openSpread()
    const button = projectButton()
    button?.focus()

    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter']) press(button ?? null, key)

    expect(keys()).toEqual(['BID-7'])
    expect(document.activeElement).toBe(input)
  })

  it('should combine the project with the text filter and say when nothing is left', async () => {
    const { pickProject, keys, type, notice } = await openSpread()
    pickProject('NTF')

    type('digest')
    const found = keys()
    type('safari')

    expect(found).toEqual(['NTF-397', 'NTF-12'])
    expect(keys()).toEqual([])
    expect(notice()).toBe('Nothing found.')
  })

  it('should be hidden when every task is of the same project', async () => {
    const { overlay } = await openSpread([tracked('NTF-1', 'todo'), tracked('NTF-2', 'progress')])

    expect(overlay.querySelector<HTMLElement>('.vproject')?.hidden).toBe(true)
  })

  it('should go back to all projects when the screen closes', async () => {
    const { pickProject, projectShown, keys, view } = await openSpread()
    pickProject('NTF')

    view.close()
    await view.open()

    expect(projectShown()).toBe('All projects')
    expect(keys()).toHaveLength(6)
  })

  it('should be hidden on a merge request tab', async () => {
    const { view, overlay } = setup({ connectors: [GITLAB_CONNECTOR], snapshots: connected })

    await view.open()

    expect(overlay.querySelector<HTMLElement>('.vproject')?.hidden).toBe(true)
  })

  it('should name all projects in Portuguese when the language is pt-BR', async () => {
    const { projectShown, projectButton } = await openSpread(spread, 'pt-BR')

    const labelId = projectButton()?.getAttribute('aria-labelledby') ?? ''

    expect(projectShown()).toBe('Todos os projetos')
    expect(document.getElementById(labelId)?.textContent).toBe('Projeto')
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

describe('views view header with three services', () => {
  const three = [
    snapshot('github-review', 'idle', [mergeRequest(7)]),
    snapshot('github-mine', 'idle', []),
    ...connected,
    snapshot('tasks', 'idle', [task('ACME-1')]),
  ]
  const connectors = [GITHUB_CONNECTOR, GITLAB_CONNECTOR, JIRA_CONNECTOR]
  const TAB_WIDTH = 90
  const TAB_STEP = 100

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The strip is `width` wide; its content is `full` wide with the service names and `compact` without
  function sizeStrip(overlay: HTMLElement, width: number, full: number, compact: number) {
    const strip = overlay.querySelector<HTMLElement>('.vtabs')
    if (!strip) throw new Error('invariant: the strip exists')
    Object.defineProperty(strip, 'clientWidth', { configurable: true, get: () => width })
    Object.defineProperty(strip, 'scrollWidth', {
      configurable: true,
      get: () => (strip.hasAttribute('data-compact') ? compact : full),
    })
    // Each tab is laid out one step after the other inside the strip
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return [...strip.querySelectorAll('.vtab')].indexOf(this) * TAB_STEP
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(TAB_WIDTH)
    return strip
  }

  it('should keep the service names when the tabs fit', async () => {
    const { view, overlay } = setup({ connectors, snapshots: three })
    const strip = sizeStrip(overlay, 900, 700, 560)

    await view.open()

    expect(strip.hasAttribute('data-compact')).toBe(false)
    expect(strip.hasAttribute('data-scrolls')).toBe(false)
    expect(overlay.querySelector('.vtab')?.getAttribute('data-tip')).toBe(
      'Pull requests waiting for your review',
    )
  })

  it('should hide the service names and name the service in each tab tooltip when the tabs do not fit', async () => {
    const { view, overlay } = setup({ connectors, snapshots: three })
    const strip = sizeStrip(overlay, 600, 700, 560)

    await view.open()

    const tabs = [...overlay.querySelectorAll('.vtab')]
    expect(strip.hasAttribute('data-compact')).toBe(true)
    expect(strip.hasAttribute('data-scrolls')).toBe(false)
    expect(tabs[0]?.getAttribute('data-tip')).toBe('GitHub · Pull requests waiting for your review')
    expect(tabs.at(-1)?.getAttribute('data-tip')).toBe('Jira · Jira issues assigned to you')
    expect(tabs[0]?.getAttribute('aria-label')).toBe('GitHub, To review, 1')
    expect(overlay.querySelectorAll('.vgroup')).toHaveLength(3)
  })

  it('should scroll the strip when even without the names the tabs do not fit', async () => {
    const { view, overlay } = setup({ connectors, snapshots: three })
    const strip = sizeStrip(overlay, 250, 700, 560)

    await view.open()

    expect(strip.hasAttribute('data-compact')).toBe(true)
    expect(strip.hasAttribute('data-scrolls')).toBe(true)
    expect(strip.classList.contains('scroll')).toBe(true)
  })

  it('should keep the active tab in view when it changes by keyboard and by mouse', async () => {
    const { view, overlay } = setup({ connectors, snapshots: three })
    const strip = sizeStrip(overlay, 250, 700, 560)
    await view.open()
    const input = overlay.querySelector('.vinput')

    for (let step = 0; step < 4; step++) press(input, 'ArrowRight')
    const byKeyboard = strip.scrollLeft
    overlay.querySelector<HTMLElement>('.vtab')?.click()
    const byMouse = strip.scrollLeft

    // The fifth tab ends at 490; with the 24px faded edge beside it the strip shows up to 514
    expect(byKeyboard).toBe(4 * TAB_STEP + TAB_WIDTH + 24 - 250)
    expect(byMouse).toBe(0)
    expect(strip.dataset.fade).toBe('end')
  })

  it('should show when the list was updated in the hint bar beside Refresh, not in the header', async () => {
    const { view, overlay } = setup({ connectors, snapshots: three })

    await view.open()

    const status = overlay.querySelector('.vstatus')
    expect(overlay.querySelector('.vhead .vstatus')).toBeNull()
    expect(status?.parentElement?.classList.contains('phint')).toBe(true)
    expect(status?.nextElementSibling?.classList.contains('pact')).toBe(true)
  })

  it('should scroll the strip sideways when the wheel turns over it', async () => {
    const { view, overlay } = setup({ connectors, snapshots: three })
    const strip = sizeStrip(overlay, 250, 700, 560)
    await view.open()
    strip.scrollLeft = 0

    strip.dispatchEvent(new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true }))

    expect(strip.scrollLeft).toBe(60)
  })
})

describe('views view hint bar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should hide navigate and then switch view, and keep the update time and Refresh, when the bar is too narrow', async () => {
    const { view, overlay } = setup({
      connectors: [GITLAB_CONNECTOR, JIRA_CONNECTOR],
      snapshots: [...connected, snapshot('tasks', 'idle', [task('ACME-1')])],
    })
    const bar = overlay.querySelector<HTMLElement>('.phint')
    if (!bar) throw new Error('invariant: the hint bar exists')
    // Every part shown takes 100px of a 400px bar
    Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 400 })
    Object.defineProperty(bar, 'scrollWidth', {
      configurable: true,
      get: () => [...bar.children].filter((child) => !(child as HTMLElement).hidden).length * 100,
    })
    await view.open()
    press(overlay.querySelector('.vinput'), 'ArrowLeft')

    const shown = [...bar.children]
      .filter((child) => !(child as HTMLElement).hidden)
      .map((child) => child.textContent)

    expect(shown).toEqual([
      'Enter open in browser',
      'Ctrl+C copy key',
      expect.stringMatching(/^Updated /),
      'Ctrl+R Refresh',
    ])
  })
})
