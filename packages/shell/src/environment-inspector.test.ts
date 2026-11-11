import type { ComposeStatus } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createEnvironmentInspector } from './environment-inspector.ts'

const ok: ComposeStatus = { kind: 'ok', project: 'app', containers: [] }

describe('createEnvironmentInspector', () => {
  it('should read the compose of the directory the session is in when the process exists', async () => {
    const seen: string[] = []
    const inspector = createEnvironmentInspector({
      processes: { inspect: async () => ({ cwd: '/p/app', foreground: 'zsh' }) },
      compose: {
        status: async (cwd) => {
          seen.push(cwd)
          return ok
        },
      },
    })

    expect(await inspector.status(1)).toBe(ok)
    expect(seen).toEqual(['/p/app'])
  })

  it('should report none when the process is gone', async () => {
    const inspector = createEnvironmentInspector({
      processes: { inspect: async () => undefined },
      compose: { status: async () => ok },
    })

    expect(await inspector.status(1)).toEqual({ kind: 'none' })
  })
})
