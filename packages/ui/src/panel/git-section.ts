import type {
  GitCommit,
  GitFile,
  GitStatus,
  GitSubmodule,
  SessionSnapshot,
  TicketLink,
  Translator,
} from '@dck/core'
import { collapseThen } from './collapse.ts'
import { h, icon } from './dom.ts'
import { agoText } from './format.ts'
import type { PanelSection } from './panel.ts'

export interface GitSource {
  snapshot(): SessionSnapshot | undefined
  requestRender(): void
  // The branch's issue in a connected tracker, only when the tracker knows its project
  ticket(branch: string | undefined): TicketLink | undefined
  // In the browser, through the host's check of the connected accounts' addresses
  openTicket(url: string): void
  // The tab's review, opened on the group of this submodule (its folder from the repository's top)
  openModule(path: string): void
  // The tab's review, opened on this file (from the repository's top; a folder opens its first file)
  openFile(path: string): void
  // The tab's review, opened where it was
  openReview(): void
}

const BRANCH_ICON =
  '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M18 11c0 4-6 3-12 5"/>'
const VISIBLE_ROWS = 5
const STORAGE_KEY = 'dck-git-groups'

type GroupId = 'staged' | 'changes' | 'incoming' | 'outgoing' | 'submodules'

function loadGroups(): Record<GroupId, boolean> {
  const open = { staged: true, changes: true, incoming: true, outgoing: true, submodules: true }
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return typeof stored === 'object' && stored !== null ? { ...open, ...stored } : open
  } catch {
    return open
  }
}

function sync(i18n: Translator, ahead: number, behind: number) {
  const part = (arrow: string, value: number) =>
    h('span', { class: value > 0 ? 'on' : undefined }, `${arrow}${value}`)
  return h(
    'span',
    { class: 'syncs', 'data-tip': i18n.t('git.sync', { behind, ahead }) },
    part('↑', ahead),
    part('↓', behind),
  )
}

function splitPath(path: string): [string, string] {
  const at = path.lastIndexOf('/', path.length - 2)
  return at === -1 ? ['', path] : [path.slice(0, at + 1), path.slice(at + 1)]
}

// A click or Enter opens the review on the file's diff
function fileRow(i18n: Translator, file: GitFile, open: (path: string) => void) {
  const [directory, base] = splitPath(file.path)
  const row = h(
    'button',
    {
      type: 'button',
      class: 'frow frow-open',
      'data-focus': `git-file-${file.path}`,
      'aria-label': i18n.t('git.fileReview.a11y', { path: file.path }),
    },
    h(
      'span',
      { class: file.status === 'D' ? 'fname del' : 'fname', 'data-tip-full': file.path },
      base,
      h('i', {}, directory),
    ),
    h('span', { class: 'fs' }, file.status),
  )
  row.addEventListener('click', () => open(file.path))
  return row
}

function commitRow(i18n: Translator, commit: GitCommit, nowSeconds: number) {
  return h(
    'div',
    { class: 'frow' },
    h('span', { class: 'fname', 'data-tip-full': commit.subject }, commit.subject),
    h(
      'span',
      { class: 'fs hash', 'data-tip': agoText(i18n, nowSeconds, commit.time) },
      commit.hash,
    ),
  )
}

// A click or Enter opens the review on the submodule's changes
function submoduleRow(i18n: Translator, module: GitSubmodule, open: (path: string) => void) {
  const row = h(
    'button',
    {
      type: 'button',
      class: 'frow frow-open',
      'data-focus': `git-module-${module.path}`,
      'aria-label': `${i18n.t('git.moduleReview.a11y', { path: module.path })}, ${i18n.plural('git.moduleChanges', module.changed)}`,
    },
    h('span', { class: 'fname' }, module.path),
    module.changed > 0 &&
      h(
        'span',
        { class: 'pill', 'data-tip': i18n.plural('git.moduleChanges', module.changed) },
        String(module.changed),
      ),
    (module.ahead > 0 || module.behind > 0) && sync(i18n, module.ahead, module.behind),
  )
  row.addEventListener('click', () => open(module.path))
  return row
}

export function createGitSection(source: GitSource, i18n: Translator): PanelSection {
  const groups = loadGroups()
  const entering = new Set<GroupId>()
  const expandedLists = new Set<GroupId>()

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
    } catch {
      // without storage, the state only lasts for this run
    }
  }

  function toggleGroup(id: GroupId, wrap: Element | null) {
    const apply = () => {
      groups[id] = !groups[id]
      if (groups[id]) entering.add(id)
      save()
      source.requestRender()
    }
    if (groups[id]) collapseThen(wrap, apply)
    else apply()
  }

  function group(
    id: GroupId,
    label: string,
    count: number,
    rows: () => (HTMLElement | false)[],
    tip?: string,
  ) {
    const open = groups[id]
    const wrap = h(
      'div',
      { class: 'body-wrap', 'data-state': entering.has(id) ? 'enter' : undefined },
      h('div', { class: 'body-inner' }, h('div', { class: 'rows' }, ...rows())),
    )
    entering.delete(id)
    const head = h(
      'button',
      {
        type: 'button',
        class: 'gh',
        'data-focus': `git-${id}`,
        'data-tip': tip,
        'aria-expanded': String(open),
      },
      icon('<path d="M9 6l6 6-6 6"/>', 10, 'gchev'),
      label,
      h('span', { class: 'pill' }, String(count)),
    )
    head.addEventListener('click', () => toggleGroup(id, wrap))
    return h('div', { class: 'group' }, head, open && wrap)
  }

  // The remote is the one Git records for the branch; with none there is nothing to name, never `origin`
  const upstreamTip = (key: 'git.pullTip' | 'git.pushTip', upstream: string | undefined) =>
    upstream === undefined ? undefined : i18n.t(key, { upstream })

  function ticketChip(ticket: TicketLink) {
    const chip = h(
      'button',
      {
        type: 'button',
        class: 'ticket',
        'data-focus': 'git-ticket',
        'data-tip': i18n.t('git.ticketTip', { key: ticket.key }),
        'aria-label': i18n.t('git.ticketTip', { key: ticket.key }),
      },
      ticket.key,
    )
    chip.addEventListener('click', () => source.openTicket(ticket.url))
    return chip
  }

  // The branch line opens the review where it was, like the review's own key
  function branchRow(git: GitStatus): HTMLElement {
    const row = h(
      'button',
      {
        type: 'button',
        class: 'brow brow-open',
        'data-focus': 'git-branch',
        'aria-label': i18n.t('git.moduleReview.a11y', {
          path: git.branch ?? i18n.t('git.detached'),
        }),
      },
      icon(BRANCH_ICON, 14, 'branch-icon'),
      h('b', { class: 'branch' }, git.branch ?? i18n.t('git.detached')),
      sync(i18n, git.ahead, git.behind),
    )
    row.addEventListener('click', () => source.openReview())
    return row
  }

  function body(git: GitStatus): HTMLElement {
    const nowSeconds = Date.now() / 1000
    const ticket = source.ticket(git.branch)
    // Long lists show the first rows and a button to see the rest
    const limited = <T>(
      id: GroupId,
      items: readonly T[],
      noun: string,
      row: (item: T) => HTMLElement,
    ) => {
      const open = expandedLists.has(id)
      const rows: (HTMLElement | false)[] = items
        .slice(0, open ? items.length : VISIBLE_ROWS)
        .map(row)
      if (items.length > VISIBLE_ROWS) {
        const toggle = h(
          'button',
          { type: 'button', class: 'more', 'data-focus': `git-more-${id}` },
          open
            ? i18n.t('git.showLess')
            : i18n.t('git.showMore', { count: items.length - VISIBLE_ROWS, noun }),
        )
        toggle.addEventListener('click', () => {
          if (open) expandedLists.delete(id)
          else expandedLists.add(id)
          source.requestRender()
        })
        rows.push(toggle)
      }
      return rows
    }
    const clean =
      git.changed === 0 &&
      git.outgoing.length === 0 &&
      git.incoming.length === 0 &&
      git.submodules.length === 0

    return h(
      'div',
      { class: 'gitbody' },
      h(
        'div',
        { class: 'group' },
        branchRow(git),
        (ticket || git.upstream) &&
          h(
            'div',
            { class: 'lrow' },
            ticket && ticketChip(ticket),
            git.upstream && h('span', { class: 'upstream' }, git.upstream),
          ),
      ),
      clean && h('p', { class: 'muted' }, i18n.t('git.clean')),
      git.staged.length > 0 &&
        group('staged', i18n.t('git.staged'), git.staged.length, () =>
          limited('staged', git.staged, i18n.t('git.files'), (file) =>
            fileRow(i18n, file, source.openFile),
          ),
        ),
      git.changes.length > 0 &&
        group('changes', i18n.t('git.changes'), git.changes.length, () =>
          limited('changes', git.changes, i18n.t('git.files'), (file) =>
            fileRow(i18n, file, source.openFile),
          ),
        ),
      git.incoming.length > 0 &&
        group(
          'incoming',
          i18n.t('git.pull'),
          git.behind,
          () =>
            limited('incoming', git.incoming, i18n.t('git.commits'), (c) =>
              commitRow(i18n, c, nowSeconds),
            ),
          upstreamTip('git.pullTip', git.upstream),
        ),
      git.outgoing.length > 0 &&
        group(
          'outgoing',
          i18n.t('git.push'),
          git.ahead,
          () =>
            limited('outgoing', git.outgoing, i18n.t('git.commits'), (c) =>
              commitRow(i18n, c, nowSeconds),
            ),
          upstreamTip('git.pushTip', git.upstream),
        ),
      git.submodules.length > 0 &&
        group('submodules', i18n.t('git.submodules'), git.submodules.length, () => [
          ...git.submodules.map((module) => submoduleRow(i18n, module, source.openModule)),
          git.submodulesClean > 0 &&
            h(
              'p',
              { class: 'muted small' },
              i18n.t('git.modulesClean', { count: git.submodulesClean }),
            ),
        ]),
    )
  }

  return {
    id: 'git',
    get label() {
      return i18n.t('git.label')
    },
    icon: BRANCH_ICON,
    expandedByDefault: true,
    summary() {
      const git = source.snapshot()?.git
      return git ? i18n.plural('git.summary', git.changed) : ''
    },
    badge: () => undefined,
    body() {
      const snapshot = source.snapshot()
      if (!snapshot) return h('p', { class: 'muted' }, i18n.t('sessions.noInfo'))
      if (!snapshot.git) return h('p', { class: 'muted' }, i18n.t('git.notRepository'))
      return body(snapshot.git)
    },
  }
}
