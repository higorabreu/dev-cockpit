import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator.ts'
import type { AgentProfile } from '../ports/agent.ts'
import type { SessionActivityInfo } from '../ports/session.ts'
import { reviewPrompt } from './review-notes.ts'
import { launchCommand, launchText, reviewSendMode } from './review-send.ts'

const claude: AgentProfile = {
  id: 'claude-code',
  name: 'Claude Code',
  processes: ['claude'],
  launch: 'claude',
}
const acme: AgentProfile = {
  id: 'acme',
  name: 'Acme Agent',
  processes: ['acme'],
  launch: 'acme run',
}
const watcherOnly: AgentProfile = { id: 'watcher', name: 'Watcher', processes: ['watcher'] }

const at = (activity: SessionActivityInfo['activity'], process = 'bash'): SessionActivityInfo => ({
  cwd: '/home/ana/acme',
  process,
  activity,
})

describe('reviewSendMode', () => {
  it('should type the line when an agent runs in the foreground', () => {
    // Arrange
    const activity = { ...at('agent', 'claude'), agent: claude }

    // Act
    const mode = reviewSendMode(activity, [claude], [claude])

    // Assert
    expect(mode).toEqual({ kind: 'agent' })
  })

  it('should start one of the installed agents when a shell waits at its prompt', () => {
    // Act
    const mode = reviewSendMode(at('idle'), [claude, acme], [claude, acme, watcherOnly])

    // Assert
    expect(mode).toEqual({ kind: 'start', agents: [claude, acme] })
  })

  it('should name the commands looked for when no agent to start is installed', () => {
    // Act
    const mode = reviewSendMode(at('idle'), [watcherOnly], [claude, acme, watcherOnly])

    // Assert
    expect(mode).toEqual({ kind: 'no-agent', commands: ['claude', 'acme'] })
  })

  it('should wait with the program name when another program holds the terminal', () => {
    // Act
    const mode = reviewSendMode(at('busy', 'vim'), [claude], [claude])

    // Assert
    expect(mode).toEqual({ kind: 'busy', process: 'vim' })
  })

  it('should keep typing the line when the activity is not known yet', () => {
    // Act
    const mode = reviewSendMode(undefined, [claude], [claude])

    // Assert
    expect(mode).toEqual({ kind: 'agent' })
  })
})

describe('launchText', () => {
  it('should quote the prompt as one argument of the agent command when it has spaces', () => {
    // Arrange
    const prompt = reviewPrompt(createTranslator('en').t, '.git/dck/review-20261117-143000.md')

    // Act
    const text = launchText('claude', prompt)

    // Assert
    expect(text).toBe("claude 'Address the review comments in .git/dck/review-20261117-143000.md'")
  })

  it('should keep a quoted path and accents inside the one argument when the prompt has them', () => {
    // Arrange
    const prompt = reviewPrompt(createTranslator('pt-BR').t, '/tmp/ana dir/dck-review-1.md')

    // Act
    const text = launchText('claude', prompt)

    // Assert
    expect(text).toBe(
      "claude 'Resolva os comentários da revisão em '\\''/tmp/ana dir/dck-review-1.md'\\'''",
    )
    expect(text).not.toContain('\n')
  })
})

describe('launchCommand', () => {
  it('should take the first word of a launch with arguments when it is looked up', () => {
    // Act
    const command = launchCommand(' acme run ')

    // Assert
    expect(command).toBe('acme')
  })
})
