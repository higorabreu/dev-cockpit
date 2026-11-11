import { type AgentSession, contextPercentage, type Translator, tokenScale } from '@dck/core'
import { h } from './dom.ts'
import { agoText } from './format.ts'
import type { PanelSection } from './panel.ts'

export interface AgentSource {
  // Indefinido até a primeira leitura; depois, a sessão do agente da aba, ou nada se não há agente
  state(): { readonly session: AgentSession | undefined } | undefined
}

const TERMINAL_ICON = '<path d="M4 5h16v14H4zM8 10l3 2-3 2M13 15h3"/>'

function tokensText(i18n: Translator, count: number): string {
  const { unit, value } = tokenScale(count)
  return i18n.t(`agent.tokens.${unit}`, { value })
}

function detailLabel(i18n: Translator, id: string): string {
  return id === 'permissionMode' ? i18n.t('agent.detail.permissionMode') : id
}

const row = (label: string, value: string, tip?: string) =>
  h(
    'div',
    { class: 'kvrow' },
    h('span', { class: 'klabel' }, label),
    h('span', { class: 'kvalue', 'data-tip-full': tip ?? value }, value),
  )

function body(i18n: Translator, session: AgentSession): HTMLElement {
  const nowSeconds = Date.now() / 1000
  const percentage =
    session.contextTokens !== undefined && session.contextWindow !== undefined
      ? contextPercentage(session.contextTokens, session.contextWindow)
      : undefined

  return h(
    'div',
    { class: 'abody' },
    h(
      'div',
      { class: 'ahead' },
      h('b', {}, session.agent.name),
      session.model &&
        h('span', { class: 'amodel', 'data-tip-full': session.model }, session.model),
    ),
    session.contextTokens !== undefined &&
      h(
        'div',
        { class: 'group' },
        h(
          'div',
          { class: 'kvrow' },
          h('span', { class: 'klabel' }, i18n.t('agent.context')),
          h('span', { class: 'kvalue' }, tokensText(i18n, session.contextTokens)),
        ),
        percentage !== undefined &&
          h(
            'div',
            { class: 'meter', role: 'img', 'aria-label': `${percentage}%` },
            h('i', { style: `width:${percentage}%` }),
          ),
        session.contextWindow !== undefined &&
          h(
            'span',
            { class: 'esub' },
            `${percentage}% ${i18n.t('agent.window', { window: tokensText(i18n, session.contextWindow) })}`,
          ),
      ),
    session.costUsd !== undefined &&
      row(
        i18n.t('agent.cost'),
        `US$ ${session.costUsd.toFixed(2)}${session.costEstimated ? ` (${i18n.t('agent.costEstimated')})` : ''}`,
      ),
    session.lastResponseAt !== undefined &&
      row(i18n.t('agent.lastResponse'), agoText(i18n, nowSeconds, session.lastResponseAt / 1000)),
    session.title && row(i18n.t('agent.session'), session.title),
    ...session.details.map((detail) => row(detailLabel(i18n, detail.id), detail.value)),
    session.contextTokens === undefined &&
      session.lastResponseAt === undefined &&
      !session.title &&
      h('p', { class: 'muted' }, i18n.t('agent.noInfo')),
  )
}

export function createAgentSection(source: AgentSource, i18n: Translator): PanelSection {
  return {
    id: 'agent',
    label: i18n.t('agent.label'),
    icon: TERMINAL_ICON,
    expandedByDefault: true,
    summary() {
      const session = source.state()?.session
      return session?.contextTokens !== undefined ? tokensText(i18n, session.contextTokens) : ''
    },
    badge: () => undefined,
    body() {
      const state = source.state()
      if (!state) return h('div', {})
      if (!state.session) return h('p', { class: 'muted' }, i18n.t('agent.none'))
      return body(i18n, state.session)
    },
  }
}
