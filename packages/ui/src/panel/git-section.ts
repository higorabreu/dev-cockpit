import {
  formatAgo,
  type GitCommit,
  type GitFile,
  type GitStatus,
  type GitSubmodule,
  type SessionSnapshot,
  ticketFromBranch,
} from '@dck/core'
import { collapseThen } from './collapse.ts'
import { h, icon } from './dom.ts'
import type { PanelSection } from './panel.ts'

export interface GitSource {
  snapshot(): SessionSnapshot | undefined
  requestRender(): void
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

function sync(ahead: number, behind: number) {
  const part = (arrow: string, value: number) =>
    h('span', { class: value > 0 ? 'on' : undefined }, `${arrow}${value}`)
  return h(
    'span',
    { class: 'syncs', 'data-tip': `${ahead} ahead, ${behind} behind` },
    part('↑', ahead),
    part('↓', behind),
  )
}

function splitPath(path: string): [string, string] {
  const at = path.lastIndexOf('/', path.length - 2)
  return at === -1 ? ['', path] : [path.slice(0, at + 1), path.slice(at + 1)]
}

function fileRow(file: GitFile) {
  const [directory, base] = splitPath(file.path)
  return h(
    'div',
    { class: 'frow' },
    h(
      'span',
      { class: file.status === 'D' ? 'fname del' : 'fname', 'data-tip-full': file.path },
      base,
      h('i', {}, directory),
    ),
    h('span', { class: 'fs' }, file.status),
  )
}

function commitRow(commit: GitCommit, nowSeconds: number) {
  return h(
    'div',
    { class: 'frow' },
    h('span', { class: 'fname', 'data-tip-full': commit.subject }, commit.subject),
    h('span', { class: 'fs hash', 'data-tip': formatAgo(nowSeconds, commit.time) }, commit.hash),
  )
}

function submoduleRow(module: GitSubmodule) {
  return h(
    'div',
    { class: 'frow' },
    h('span', { class: 'fname' }, module.path),
    module.changed > 0 &&
      h('span', { class: 'pill', 'data-tip': `${module.changed} changed` }, String(module.changed)),
    (module.ahead > 0 || module.behind > 0) && sync(module.ahead, module.behind),
  )
}

export function createGitSection(source: GitSource): PanelSection {
  const groups = loadGroups()
  const entering = new Set<GroupId>()
  const expandedLists = new Set<GroupId>()

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
    } catch {
      // sem armazenamento, o estado vale só nesta execução
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

  function group(id: GroupId, label: string, count: number, rows: () => (HTMLElement | false)[]) {
    const open = groups[id]
    const wrap = h(
      'div',
      { class: 'body-wrap', 'data-state': entering.has(id) ? 'enter' : undefined },
      h('div', { class: 'body-inner' }, h('div', { class: 'rows' }, ...rows())),
    )
    entering.delete(id)
    const head = h(
      'button',
      { type: 'button', class: 'gh', 'data-focus': `git-${id}`, 'aria-expanded': String(open) },
      icon('<path d="M9 6l6 6-6 6"/>', 10, 'gchev'),
      label,
      h('span', { class: 'pill' }, String(count)),
    )
    head.addEventListener('click', () => toggleGroup(id, wrap))
    return h('div', { class: 'group' }, head, open && wrap)
  }

  function body(git: GitStatus): HTMLElement {
    const nowSeconds = Date.now() / 1000
    const ticket = ticketFromBranch(git.branch)
    // Listas longas mostram as primeiras linhas e um botão para ver o resto
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
          open ? 'Show less' : `Show ${items.length - VISIBLE_ROWS} more ${noun}`,
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
        h(
          'div',
          { class: 'brow' },
          icon(BRANCH_ICON, 14, 'branch-icon'),
          h('b', { class: 'branch' }, git.branch ?? 'HEAD detached'),
          sync(git.ahead, git.behind),
        ),
        (ticket || git.upstream) &&
          h(
            'div',
            { class: 'lrow' },
            ticket && h('span', { class: 'chip', 'data-tip': 'Ticket extraído da branch' }, ticket),
            git.upstream && h('span', { class: 'upstream' }, git.upstream),
          ),
      ),
      clean && h('p', { class: 'muted' }, 'Working tree clean'),
      git.staged.length > 0 &&
        group('staged', 'Staged', git.staged.length, () =>
          limited('staged', git.staged, 'files', fileRow),
        ),
      git.changes.length > 0 &&
        group('changes', 'Changes', git.changes.length, () =>
          limited('changes', git.changes, 'files', fileRow),
        ),
      git.incoming.length > 0 &&
        group('incoming', 'Incoming', git.behind, () =>
          limited('incoming', git.incoming, 'commits', (c) => commitRow(c, nowSeconds)),
        ),
      git.outgoing.length > 0 &&
        group('outgoing', 'Outgoing', git.ahead, () =>
          limited('outgoing', git.outgoing, 'commits', (c) => commitRow(c, nowSeconds)),
        ),
      git.submodules.length > 0 &&
        group('submodules', 'Submodules', git.submodules.length, () => [
          ...git.submodules.map(submoduleRow),
          git.submodulesClean > 0 &&
            h('p', { class: 'muted small' }, `${git.submodulesClean} up to date`),
        ]),
    )
  }

  return {
    id: 'git',
    label: 'Git',
    icon: BRANCH_ICON,
    expandedByDefault: true,
    summary() {
      const git = source.snapshot()?.git
      return git ? `${git.changed} changes` : ''
    },
    badge: () => undefined,
    body() {
      const snapshot = source.snapshot()
      if (!snapshot) return h('p', { class: 'muted' }, 'Sem informação')
      if (!snapshot.git) return h('p', { class: 'muted' }, 'Not a git repository')
      return body(snapshot.git)
    },
  }
}
