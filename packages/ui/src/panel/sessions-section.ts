import {
  type AgentProfile,
  type FinishedCommand,
  formatDuration,
  type SessionActivityInfo,
  type Translator,
  UNKNOWN_FOREGROUND,
} from '@dck/core'
import { h } from './dom.ts'
import { activityGlyph } from './glyphs.ts'
import type { PanelSection } from './panel.ts'

export interface SessionsSource {
  tabs(): readonly { id: string; label: string }[]
  activeId(): string | undefined
  info(id: string): SessionActivityInfo | undefined
  // Something finished out of sight and the user has not seen it yet
  finished(id: string): FinishedCommand | undefined
  // An agent stopped to ask and the user has not seen it yet
  needsYou(id: string): boolean
  finishedCount(): number
  select(id: string): void
  // The agent to suggest connecting in this tab, when it runs without sending any signal
  connectHint(id: string): AgentProfile | undefined
  connect(id: string): void
  // "Not now": the hint stops showing until it is turned back on in settings
  dismissConnect(): void
}

const RANK = { agent: 0, busy: 1, idle: 2 } as const
const folder = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

function describe(i18n: Translator, info: SessionActivityInfo | undefined) {
  if (!info) return i18n.t('sessions.noInfo')
  if (info.activity === 'busy') {
    return info.process === UNKNOWN_FOREGROUND
      ? i18n.t('sessions.busyUnknown')
      : i18n.t('sessions.busy', { process: info.process })
  }
  if (info.activity === 'agent') {
    return i18n.t('sessions.agent', { agent: info.agent?.name ?? info.process })
  }
  return i18n.t('sessions.idle')
}

function describeFinished(i18n: Translator, done: FinishedCommand) {
  const duration = formatDuration(done.durationMs)
  return done.process === UNKNOWN_FOREGROUND
    ? i18n.t('sessions.finishedUnknown', { duration })
    : i18n.t('sessions.finished', { process: done.process, duration })
}

export function createSessionsSection(source: SessionsSource, i18n: Translator): PanelSection {
  function connectHint(tabId: string): HTMLElement {
    const textId = `sconnect-${tabId}`
    const connect = h(
      'button',
      {
        type: 'button',
        class: 'sconnect-go',
        'data-focus': `connect-${tabId}`,
        'aria-describedby': textId,
      },
      i18n.t('sessions.connect.action'),
    )
    connect.addEventListener('click', () => source.connect(tabId))
    const later = h(
      'button',
      { type: 'button', class: 'sconnect-later', 'data-focus': `connect-later-${tabId}` },
      i18n.t('sessions.connect.dismiss'),
    )
    later.addEventListener('click', () => source.dismissConnect())
    return h(
      'div',
      { class: 'sconnect' },
      h('span', { id: textId }, i18n.t('sessions.connect.hint')),
      h('span', { class: 'sconnect-actions' }, connect, later),
    )
  }

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
      // One connection serves every session, so the hint shows once, under the first agent that needs it
      let hinted = false
      const rows = source
        .tabs()
        .map((tab, order) => ({
          tab,
          order,
          info: source.info(tab.id),
          done: source.finished(tab.id),
          asks: source.needsYou(tab.id),
        }))
        .sort(
          (a, b) =>
            Number(b.asks) - Number(a.asks) ||
            Number(Boolean(b.done)) - Number(Boolean(a.done)) ||
            RANK[a.info?.activity ?? 'idle'] - RANK[b.info?.activity ?? 'idle'] ||
            a.order - b.order,
        )
        .flatMap(({ tab, info, done, asks }) => {
          const row = h(
            'button',
            {
              type: 'button',
              class: 'srow',
              'aria-current': tab.id === source.activeId() ? 'true' : undefined,
            },
            asks
              ? activityGlyph('needs-you')
              : done
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
                asks
                  ? i18n.t('sessions.needsYou')
                  : done
                    ? describeFinished(i18n, done)
                    : describe(i18n, info),
              ),
            ),
            asks || done
              ? h('span', { class: 'new' }, i18n.t('sessions.new'))
              : info && h('span', { class: 'smeta' }, folder(info.cwd)),
          )
          row.addEventListener('click', () => source.select(tab.id))
          if (hinted || !source.connectHint(tab.id)) return [row]
          hinted = true
          return [row, connectHint(tab.id)]
        })
      return h('div', { class: 'slist' }, ...rows)
    },
  }
}
