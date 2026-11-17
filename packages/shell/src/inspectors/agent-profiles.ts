import type { AgentProfile } from '@dck/core'

const claudeCodeInstall =
  'claude plugin marketplace add higorabreu/dev-cockpit && claude plugin install dck@dev-cockpit'

// The agents the cockpit recognizes in a tab; core and the interface only see this data
export const agentProfiles: readonly AgentProfile[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    processes: ['claude'],
    // `claude "query"` starts an interactive session with that first prompt (Claude Code's CLI reference)
    launch: 'claude',
    connect: {
      shell: claudeCodeInstall,
      // Claude Code runs a line that starts with `!` in a shell, so it installs without quitting
      inAgent: `!${claudeCodeInstall}`,
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    // The npm launcher hands its process to the native `codex` binary with execve, so this is the name
    processes: ['codex'],
    // Nothing to connect: its TUI reports its own state to the terminal (OSC 7501) since 0.163.0
  },
]
