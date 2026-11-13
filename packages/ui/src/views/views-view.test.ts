// @vitest-environment happy-dom
import {
  type Connector,
  createTranslator,
  GITLAB_CONNECTOR,
  type HostApi,
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
