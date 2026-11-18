import type { Translate } from '../i18n/translator.ts'
import { formatDuration } from './duration.ts'
import type { AgentEvent } from './tracker.ts'

// An agent that asks, an agent's turn, or a long command the shell ran, each in its own words
export function notificationText(event: AgentEvent, tab: string, t: Translate): string {
  if (event.kind === 'needs-you') return t('notify.needsYou', { tab })
  const duration = formatDuration(event.durationMs)
  if (event.source === 'agent') return t('notify.agentAnswered', { tab, duration })
  if (event.process === '') return t('notify.finishedUnknown', { tab, duration })
  return t('notify.finished', { tab, process: event.process, duration })
}
