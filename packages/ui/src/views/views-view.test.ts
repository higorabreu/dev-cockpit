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
import { describe, expect, it } from 'vitest'
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

function setup(options: { connectors: readonly Connector[]; snapshots: ViewSnapshot[] }) {
  const stored = new Map(options.snapshots.map((entry) => [entry.view, entry]))
  const opened: string[] = []
  const badges: { count: number; label: PluralKey | undefined }[] = []
  const copied: string[] = []
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
    i18n: createTranslator('en'),
    onClose: () => undefined,
    openSettings: () => {
      settingsOpened += 1
    },
    onBadge: (count, label) => void badges.push({ count, label }),
    onCopied: (text) => void copied.push(text),
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
    copied,
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

    expect(tabs()).toEqual(['Assigned2', 'Created0'])
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
  it('should show only Tasks when Jira is the only connected account', async () => {
    const { tabs } = await openTasks()

    expect(tabs()).toEqual(['Tasks3'])
  })

  it('should show the merge request tabs and then Tasks when both accounts are connected', async () => {
    const { tabs, overlay } = await openTasks(both)

    expect(tabs()).toEqual(['Assigned2', 'Created0', 'Tasks3'])
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

  it('should copy the key of the selected task and show the notice when Ctrl+C is pressed', async () => {
    const { input, ctrl, copied, clipboard } = await openTasks()
    press(input, 'ArrowDown')

    ctrl('c')
    await settle()

    expect(clipboard).toEqual(['ACME-9'])
    expect(copied).toEqual(['ACME-9'])
  })

  it('should leave Ctrl+C to the filter when text is selected in it', async () => {
    const { input, ctrl, type, copied } = await openTasks()
    type('ACME')
    input?.setSelectionRange(0, 4)

    const handled = !ctrl('c')
    await settle()

    expect(handled).toBe(false)
    expect(copied).toEqual([])
  })

  it('should copy the key without opening the task when the key is clicked', async () => {
    const { rows, copied, opened } = await openTasks()

    rows()[2]?.querySelector<HTMLElement>('.vref')?.click()
    await settle()

    expect(copied).toEqual(['OPS-3'])
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

    expect(context.copied).toEqual([])
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
