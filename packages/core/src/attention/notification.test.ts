import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator.ts'
import { notificationText } from './notification.ts'

const { t } = createTranslator('en')
const finished = (source: 'agent' | 'command', process: string) =>
  ({ kind: 'finished', tabId: 'a', source, process, durationMs: 7000, notify: true }) as const

describe('notificationText', () => {
  it('should name the command and how long it ran when a command the shell ran finished', () => {
    expect(notificationText(finished('command', 'sleep'), 'shell 1', t)).toBe(
      'shell 1: sleep finished in 7 s',
    )
  })

  it('should say the agent answered when an agent ended its turn', () => {
    expect(notificationText(finished('agent', 'claude'), 'api', t)).toBe(
      'api: the agent answered in 7 s',
    )
  })

  it('should speak of the command when its name is unknown', () => {
    expect(notificationText(finished('command', ''), 'shell 1', t)).toBe(
      'shell 1: the command finished in 7 s',
    )
  })

  it('should say the agent needs the user when it stopped to ask', () => {
    const event = { kind: 'needs-you', tabId: 'a', notify: true } as const

    expect(notificationText(event, 'api', t)).toContain('api')
  })
})
