import type { AgentProfile } from '@dck/core'

const claudeCodeInstall =
  'claude plugin marketplace add higorabreu/dev-cockpit && claude plugin install dck@dev-cockpit'

// The agents the cockpit recognizes in a tab; core and the interface only see this data
export const agentProfiles: readonly AgentProfile[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    processes: ['claude'],
    connect: {
      shell: claudeCodeInstall,
      // Claude Code runs a line that starts with `!` in a shell, so it installs without quitting
      inAgent: `!${claudeCodeInstall}`,
    },
  },
]
