import type { AgentProfile, GitStatus } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createSessionInspector } from './session-inspector.ts'

const status: GitStatus = {
  root: '/p/app',
  branch: 'main',
  upstream: 'origin/main',
  changed: 2,
  staged: [],
  changes: [],
  ahead: 1,
  behind: 0,
  outgoing: [],
  incoming: [],
  submodules: [],
  submodulesClean: 0,
}

const agent: AgentProfile = { id: 'claude', name: 'Claude', processes: ['claude'] }

const inspector = (foreground: string | undefined, git: GitStatus | undefined) =>
  createSessionInspector({
    agents: [agent],
    processes: {
      inspect: async () => (foreground === undefined ? undefined : { cwd: '/p/app', foreground }),
    },
    git: { status: async () => git },
  })

describe('createSessionInspector', () => {
  it('should combine the process and the git status when the session is in a repository', async () => {
    const snapshot = await inspector('zsh', status).snapshot(1)

    expect(snapshot).toEqual({ cwd: '/p/app', process: 'zsh', activity: 'idle', git: status })
  })

  it('should leave the git status out when the directory is not a repository', async () => {
    const snapshot = await inspector('zsh', undefined).snapshot(1)

    expect(snapshot).toEqual({ cwd: '/p/app', process: 'zsh', activity: 'idle' })
  })

  it('should mark the session as an agent when a known agent is in the foreground', async () => {
    const snapshot = await inspector('claude', status).snapshot(1)

    expect(snapshot?.activity).toBe('agent')
    expect(snapshot?.agent).toEqual(agent)
  })

  it('should be undefined when the process is gone', async () => {
    expect(await inspector(undefined, status).snapshot(1)).toBeUndefined()
  })

  it('should report the activity without asking git when only the activity is needed', async () => {
    let asked = false
    const light = createSessionInspector({
      processes: { inspect: async () => ({ cwd: '/p/app', foreground: 'pnpm' }) },
      git: {
        status: async () => {
          asked = true
          return undefined
        },
      },
    })

    const info = await light.activity(1)

    expect(info).toEqual({ cwd: '/p/app', process: 'pnpm', activity: 'busy' })
    expect(asked).toBe(false)
  })
})
