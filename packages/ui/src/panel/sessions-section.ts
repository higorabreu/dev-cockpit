import { type FinishedCommand, formatDuration, type SessionActivityInfo } from '@dck/core'
import { h } from './dom.ts'
import { ACTIVITY_LABEL, activityGlyph } from './glyphs.ts'
import type { PanelSection } from './panel.ts'

export interface SessionsSource {
  tabs(): readonly { id: string; label: string }[]
  activeId(): string | undefined
  info(id: string): SessionActivityInfo | undefined
  // Algo que terminou fora da vista e o usuário ainda não viu
  finished(id: string): FinishedCommand | undefined
  finishedCount(): number
  select(id: string): void
}

const RANK = { claude: 0, busy: 1, idle: 2 } as const
const folder = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

function describe(info: SessionActivityInfo | undefined) {
  if (!info) return 'Sem informação'
  return info.activity === 'busy' ? `Executando ${info.process}` : ACTIVITY_LABEL[info.activity]
}

export function createSessionsSection(source: SessionsSource): PanelSection {
  return {
    id: 'sessions',
    label: 'Sessões',
    icon: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    expandedByDefault: true,
    summary: () => {
      const count = source.tabs().length
      return `${count} ${count === 1 ? 'aba' : 'abas'}`
    },
    badge: () => (source.finishedCount() > 0 ? String(source.finishedCount()) : undefined),
    body() {
      const rows = source
        .tabs()
        .map((tab, order) => ({
          tab,
          order,
          info: source.info(tab.id),
          done: source.finished(tab.id),
        }))
        .sort(
          (a, b) =>
            Number(Boolean(b.done)) - Number(Boolean(a.done)) ||
            RANK[a.info?.activity ?? 'idle'] - RANK[b.info?.activity ?? 'idle'] ||
            a.order - b.order,
        )
        .map(({ tab, info, done }) => {
          const row = h(
            'button',
            {
              type: 'button',
              class: 'srow',
              'aria-current': tab.id === source.activeId() ? 'true' : undefined,
            },
            done
              ? activityGlyph('done')
              : info
                ? activityGlyph(info.activity)
                : h('span', { class: 'glyph' }),
            h(
              'span',
              { class: 'stext' },
              h('span', { class: 'sname' }, tab.label),
              h(
                'span',
                { class: 'sstate' },
                done
                  ? `Terminou, ${done.process} em ${formatDuration(done.durationMs)}`
                  : describe(info),
              ),
            ),
            done
              ? h('span', { class: 'new' }, 'novo')
              : info && h('span', { class: 'smeta' }, folder(info.cwd)),
          )
          row.addEventListener('click', () => source.select(tab.id))
          return row
        })
      return h('div', { class: 'slist' }, ...rows)
    },
  }
}
