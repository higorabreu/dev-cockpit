import {
  type FinishedCommand,
  formatDuration,
  type SessionActivityInfo,
  type Translator,
} from '@dck/core'
import { h } from './dom.ts'
import { activityGlyph } from './glyphs.ts'
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

const RANK = { agent: 0, busy: 1, idle: 2 } as const
const folder = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

function describe(i18n: Translator, info: SessionActivityInfo | undefined) {
  if (!info) return i18n.t('sessions.noInfo')
  if (info.activity === 'busy') return i18n.t('sessions.busy', { process: info.process })
  if (info.activity === 'agent') {
    return i18n.t('sessions.agent', { agent: info.agent?.name ?? info.process })
  }
  return i18n.t('sessions.idle')
}

export function createSessionsSection(source: SessionsSource, i18n: Translator): PanelSection {
  return {
    id: 'sessions',
    get label() {
      return i18n.t('sessions.label')
    },
    icon: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    expandedByDefault: true,
    summary: () => i18n.plural('sessions.count', source.tabs().length),
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
                  ? i18n.t('sessions.finished', {
                      process: done.process,
                      duration: formatDuration(done.durationMs),
                    })
                  : describe(i18n, info),
              ),
            ),
            done
              ? h('span', { class: 'new' }, i18n.t('sessions.new'))
              : info && h('span', { class: 'smeta' }, folder(info.cwd)),
          )
          row.addEventListener('click', () => source.select(tab.id))
          return row
        })
      return h('div', { class: 'slist' }, ...rows)
    },
  }
}
