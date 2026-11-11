import type { GitStatus } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createSessionInspector } from './session-inspector.ts'

const status: GitStatus = { root: '/p/app', branch: 'main', changed: 2, ahead: 1, behind: 0 }

const inspector = (foreground: string | undefined, git: GitStatus | undefined) =>
  createSessionInspector({
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

  it('should mark the session as claude when claude is in the foreground', async () => {
    const snapshot = await inspector('claude', status).snapshot(1)

    expect(snapshot?.activity).toBe('claude')
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
