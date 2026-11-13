import type { LogContext } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { watchSettingsFile } from './settings-watch.ts'

function setup(options: { failing?: boolean } = {}) {
  const watched: string[] = []
  let emit: (event: string, name: string | null) => void = () => undefined
  let closed = false
  const timers: { milliseconds: number; task: () => void; cancelled: boolean }[] = []
  const warnings: { message: string; context: LogContext | undefined }[] = []
  let reloads = 0
  const stop = watchSettingsFile({
    file: '/home/ana/.config/dev-cockpit/settings.json',
    watch: (folder, listener) => {
      if (options.failing) throw new Error('ENOSPC')
      watched.push(folder)
      emit = listener
      return {
        close: () => {
          closed = true
        },
      }
    },
    onChange: () => {
      reloads += 1
    },
    scheduler: {
      after(milliseconds, task) {
        const timer = { milliseconds, task, cancelled: false }
        timers.push(timer)
        return () => {
          timer.cancelled = true
        }
      },
    },
    logger: {
      info() {},
      warn: (message, context) => void warnings.push({ message, context }),
      error() {},
    },
  })
  const settle = () => {
    for (const timer of timers.splice(0)) if (!timer.cancelled) timer.task()
  }
  return {
    stop,
    watched,
    emit: (event: string, name: string | null) => emit(event, name),
    settle,
    reloads: () => reloads,
    closed: () => closed,
    warnings,
  }
}

describe('watchSettingsFile', () => {
  it('should watch the folder of the settings file when started', () => {
    const { watched } = setup()

    expect(watched).toEqual(['/home/ana/.config/dev-cockpit'])
  })

  it('should reload once when a save brings a burst of events for the file', () => {
    const { emit, settle, reloads } = setup()

    emit('change', 'settings.json.tmp')
    emit('rename', 'settings.json')
    emit('change', 'settings.json')
    settle()

    expect(reloads()).toBe(1)
  })

  it('should not reload when another file of the folder changes', () => {
    const { emit, settle, reloads } = setup()

    emit('change', 'recent-projects.json')
    emit('rename', null)
    settle()

    expect(reloads()).toBe(0)
  })

  it('should close the watch and drop a pending reload when stopped', () => {
    const { stop, emit, settle, reloads, closed } = setup()
    emit('change', 'settings.json')

    stop()
    settle()

    expect(closed()).toBe(true)
    expect(reloads()).toBe(0)
  })

  it('should warn and keep the app going when the system refuses the watch', () => {
    const { warnings, stop } = setup({ failing: true })

    stop()

    expect(warnings.map((warning) => warning.message)).toEqual([
      'cannot watch the settings file, changes from the CLI apply at the next start',
    ])
  })
})
