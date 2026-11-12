import { type ComposeContainer, type ComposeStatus, type Translator, uptimeParts } from '@dck/core'
import { h, icon } from './dom.ts'
import { activityGlyph } from './glyphs.ts'
import type { PanelSection } from './panel.ts'

export interface EnvironmentSource {
  // Undefined until the first read
  status(): ComposeStatus | undefined
}

const CUBE_ICON = '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>'
const FOLDER_ICON =
  '<path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'

function uptimeText(i18n: Translator, status: string): string | undefined {
  const parts = uptimeParts(status)
  if (!parts) return undefined
  return parts.unit === 'mo'
    ? i18n.plural('env.up.mo', parts.value, { value: parts.value })
    : i18n.t(`env.up.${parts.unit}`, { value: parts.value })
}

function containerRow(i18n: Translator, container: ComposeContainer) {
  const details = [
    container.state === 'running' ? uptimeText(i18n, container.status) : undefined,
    container.health ? i18n.t(`env.${container.health}`) : undefined,
  ].filter((part): part is string => part !== undefined)
  const showName = container.name !== container.service

  return h(
    'div',
    { class: 'erow', 'data-state': container.state },
    activityGlyph(container.state),
    h(
      'span',
      { class: 'etext' },
      h('span', { class: 'ename' }, container.service),
      showName && h('span', { class: 'esub' }, container.name),
    ),
    h(
      'span',
      { class: 'eright', 'data-tip': container.status || undefined },
      h('span', { class: 'estate' }, i18n.t(`env.${container.state}`)),
      details.length > 0 && h('span', { class: 'esub' }, details.join(', ')),
    ),
  )
}

export function createEnvironmentSection(
  source: EnvironmentSource,
  i18n: Translator,
): PanelSection {
  return {
    id: 'env',
    get label() {
      return i18n.t('env.label')
    },
    icon: CUBE_ICON,
    expandedByDefault: false,
    summary() {
      const status = source.status()
      return status?.kind === 'ok' ? i18n.plural('env.summary', status.containers.length) : ''
    },
    badge: () => undefined,
    body() {
      const status = source.status()
      if (!status) return h('div', {})
      if (status.kind === 'none') return h('p', { class: 'muted' }, i18n.t('env.none'))
      if (status.kind === 'unavailable')
        return h('p', { class: 'muted' }, i18n.t('env.unavailable'))
      return h(
        'div',
        { class: 'group' },
        h(
          'div',
          { class: 'ehead' },
          icon(FOLDER_ICON, 14, 'ehead-icon'),
          h('span', {}, status.project),
        ),
        h('div', { class: 'elist' }, ...status.containers.map((c) => containerRow(i18n, c))),
      )
    },
  }
}
