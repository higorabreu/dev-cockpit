import { silentLogger } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { launchDaemon, type SpawnOptions } from './daemon-launcher.ts'

function launch(env: Record<string, string | undefined> = {}) {
  const calls: Array<{ command: string; args: readonly string[]; options: SpawnOptions }> = []
  let unreferenced = false
  launchDaemon(
    {
      spawn: (command, args, options) => {
        calls.push({ command, args, options })
        return {
          unref: () => {
            unreferenced = true
          },
        }
      },
      execPath: '/opt/electron',
      script: '/app/daemon.cjs',
      env,
      logFd: 7,
    },
    silentLogger,
  )
  return { call: calls[0], unreferenced }
}

describe('launchDaemon', () => {
  it('should run the daemon script with the app binary acting as Node when launching', () => {
    const { call } = launch()

    expect(call?.command).toBe('/opt/electron')
    expect(call?.args).toEqual(['/app/daemon.cjs'])
    expect(call?.options.env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('should detach the daemon and send its output to the log when launching', () => {
    const { call, unreferenced } = launch()

    expect(call?.options.detached).toBe(true)
    expect(call?.options.stdio).toEqual(['ignore', 7, 7])
    expect(unreferenced).toBe(true)
  })

  it('should keep the endpoint of the environment when launching', () => {
    const { call } = launch({ DCK_ENDPOINT: '/tmp/x.sock' })

    expect(call?.options.env.DCK_ENDPOINT).toBe('/tmp/x.sock')
  })
})
