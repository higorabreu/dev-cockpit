import {
  type GitCommit,
  type GitFile,
  type GitStatus,
  type GitSubmodule,
  type SessionSnapshot,
  type StandardMarks,
  type Translator,
  ticketFromBranch,
} from '@dck/core'
import { collapseThen } from './collapse.ts'
import { h, icon } from './dom.ts'
import { agoText } from './format.ts'
import { activityGlyph } from './glyphs.ts'
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

// Marks what is outside an enabled standard, with the rules that failed in the tooltip
function standardMark(i18n: Translator, rules: readonly string[] | undefined) {
  if (!rules || rules.length === 0) return false
  const tip = i18n.t('git.standardTip', { rules: rules.join('; ') })
  return h(
    'span',
    { class: 'std-mark', role: 'img', 'aria-label': tip, 'data-tip': tip },
    activityGlyph('warning'),
  )
}

function commitRow(
  i18n: Translator,
  commit: GitCommit,
  nowSeconds: number,
  failed?: readonly string[],
) {
  return h(
    'div',
    { class: 'frow' },
    h('span', { class: 'fname', 'data-tip-full': commit.subject }, commit.subject),
    standardMark(i18n, failed),
    h(
      'span',
      { class: 'fs hash', 'data-tip': agoText(i18n, nowSeconds, commit.time) },
      commit.hash,
    ),
  )
}

function submoduleRow(i18n: Translator, module: GitSubmodule) {
  return h(
    'div',
    { class: 'frow' },
    h('span', { class: 'fname' }, module.path),
    module.changed > 0 &&
      h(
        'span',
        { class: 'pill', 'data-tip': i18n.plural('git.moduleChanges', module.changed) },
        String(module.changed),
      ),
    (module.ahead > 0 || module.behind > 0) && sync(i18n, module.ahead, module.behind),
  )
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

  function body(git: GitStatus, marks: StandardMarks | undefined): HTMLElement {
    const nowSeconds = Date.now() / 1000
    const ticket = ticketFromBranch(git.branch)
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
        h(
          'div',
          { class: 'brow' },
          icon(BRANCH_ICON, 14, 'branch-icon'),
          h('b', { class: 'branch' }, git.branch ?? i18n.t('git.detached')),
          standardMark(i18n, marks?.branch),
          sync(i18n, git.ahead, git.behind),
        ),
        (ticket || git.upstream) &&
          h(
            'div',
            { class: 'lrow' },
            ticket && h('span', { class: 'chip', 'data-tip': i18n.t('git.ticketTip') }, ticket),
            git.upstream && h('span', { class: 'upstream' }, git.upstream),
          ),
      ),
      clean && h('p', { class: 'muted' }, i18n.t('git.clean')),
      git.staged.length > 0 &&
        group('staged', i18n.t('git.staged'), git.staged.length, () =>
          limited('staged', git.staged, i18n.t('git.files'), fileRow),
        ),
      git.changes.length > 0 &&
        group('changes', i18n.t('git.changes'), git.changes.length, () =>
          limited('changes', git.changes, i18n.t('git.files'), fileRow),
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
          i18n.t('git.pullTip', { upstream: git.upstream ?? 'origin' }),
        ),
      git.outgoing.length > 0 &&
        group(
          'outgoing',
          i18n.t('git.push'),
          git.ahead,
          () =>
            limited('outgoing', git.outgoing, i18n.t('git.commits'), (c) =>
              commitRow(i18n, c, nowSeconds, marks?.commits[c.hash]),
            ),
          i18n.t('git.pushTip', { upstream: git.upstream ?? 'origin' }),
        ),
      git.submodules.length > 0 &&
        group('submodules', i18n.t('git.submodules'), git.submodules.length, () => [
          ...git.submodules.map((module) => submoduleRow(i18n, module)),
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
      return body(snapshot.git, snapshot.standards)
    },
  }
}
