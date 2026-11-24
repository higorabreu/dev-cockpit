import { silentLogger } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { watchThemesFolder } from './themes-watch.ts'

const FOLDER = '/home/ana/.config/dev-cockpit/themes'

function setup(existing: boolean) {
  let exists = existing
  const listeners = new Map<string, (event: string, name: string | null) => void>()
  const timers: (() => void)[] = []
  let reloads = 0
  const stop = watchThemesFolder({
    folder: FOLDER,
    watch(folder, listener) {
      if (folder === FOLDER && !exists)
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      listeners.set(folder, listener)
      return { close: () => void listeners.delete(folder) }
    },
    onChange: () => {
      reloads += 1
    },
    scheduler: {
      after(_milliseconds, task) {
        timers.push(task)
        return () => undefined
      },
    },
    logger: silentLogger,
  })
  return {
    stop,
    listeners,
    create: () => {
      exists = true
    },
    settle: () => {
      for (const task of timers.splice(0)) task()
    },
    reloads: () => reloads,
  }
}

describe('watchThemesFolder', () => {
  it('should reload when a theme file in the folder changes', () => {
    const watch = setup(true)

    watch.listeners.get(FOLDER)?.('change', 'dusk.json')
    watch.listeners.get(FOLDER)?.('rename', 'dusk.json.tmp')
    watch.settle()

    expect(watch.reloads()).toBe(1)
  })

  it('should watch the parent and then the folder when the folder appears later', () => {
    const watch = setup(false)
    expect([...watch.listeners.keys()]).toEqual(['/home/ana/.config/dev-cockpit'])

    watch.create()
    watch.listeners.get('/home/ana/.config/dev-cockpit')?.('rename', 'themes')
    watch.settle()

    expect(watch.listeners.has(FOLDER)).toBe(true)
    expect(watch.reloads()).toBe(1)
  })

  it('should close every watch when stopped', () => {
    const watch = setup(false)

    watch.stop()

    expect(watch.listeners.size).toBe(0)
  })
})
