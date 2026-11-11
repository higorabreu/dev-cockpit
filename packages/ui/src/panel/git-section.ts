import type { SessionSnapshot } from '@dck/core'
import { h, icon } from './dom.ts'
import type { PanelSection } from './panel.ts'

export interface GitSource {
  snapshot(): SessionSnapshot | undefined
}

const BRANCH_ICON =
  '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M18 11c0 4-6 3-12 5"/>'

function sync(ahead: number, behind: number) {
  const part = (arrow: string, value: number) =>
    h('span', { class: value > 0 ? 'on' : undefined }, `${arrow}${value}`)
  return h(
    'span',
    { class: 'syncs', title: `${ahead} à frente, ${behind} atrás` },
    part('↑', ahead),
    part('↓', behind),
  )
}

export function createGitSection(source: GitSource): PanelSection {
  return {
    id: 'git',
    label: 'Git',
    icon: BRANCH_ICON,
    expandedByDefault: true,
    summary() {
      const git = source.snapshot()?.git
      return git ? `${git.changed} alterados` : ''
    },
    badge: () => undefined,
    body() {
      const snapshot = source.snapshot()
      if (!snapshot) return h('p', { class: 'muted' }, 'Sem informação')
      const git = snapshot.git
      if (!git) return h('p', { class: 'muted' }, 'Fora de um repositório git')
      return h(
        'div',
        { class: 'group' },
        h(
          'div',
          { class: 'brow' },
          icon(BRANCH_ICON, 14, 'branch-icon'),
          h('b', { class: 'branch', title: git.branch ?? '' }, git.branch ?? 'HEAD solta'),
          sync(git.ahead, git.behind),
        ),
        h(
          'p',
          { class: 'muted' },
          git.changed === 0
            ? 'Sem alterações'
            : `${git.changed} ${git.changed === 1 ? 'arquivo alterado' : 'arquivos alterados'}`,
        ),
      )
    },
  }
}
