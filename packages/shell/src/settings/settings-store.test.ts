import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultSettings, silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettingsStore } from './settings-store.ts'

let directory = ''
let file = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-settings-'))
  file = join(directory, 'nested', 'settings.json')
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const make = (
  env: Record<string, string> = {},
  veto?: Parameters<typeof createSettingsStore>[0]['veto'],
) => createSettingsStore({ file, logger: silentLogger, env, ...(veto ? { veto } : {}) })

describe('createSettingsStore load', () => {
  it('should start with the defaults and say it is fresh when there is no file', async () => {
    const view = await make().load()

    expect(view.settings).toEqual(defaultSettings)
    expect(view.fresh).toBe(true)
  })

  it('should read the saved values and say it is not fresh when the file exists', async () => {
    const first = make()
    await first.load()
    await first.update({ theme: 'light' })

    const view = await make().load()

    expect(view.settings.theme).toBe('light')
    expect(view.fresh).toBe(false)
  })

  it('should use the defaults when the file is not valid json', async () => {
    await make().update({ theme: 'light' })
    await writeFile(file, '{ nope')

    expect((await make().load()).settings).toEqual(defaultSettings)
  })

  it('should keep the valid fields and reset only the broken one when the file was edited by hand', async () => {
    await make().update({ theme: 'light' })
    await writeFile(file, JSON.stringify({ theme: 'light', opacity: 'muito' }))

    const view = await make().load()

    expect(view.settings.theme).toBe('light')
    expect(view.settings.opacity).toBe(0.92)
  })

  it('should let the environment variables win and lock them when they are set', async () => {
    const view = await make({ DCK_KEY: 'F8' }).load()

    expect(view.settings.shortcuts.toggleWindow).toBe('F8')
    expect(view.locked).toEqual(['shortcuts.toggleWindow'])
  })
})

describe('createSettingsStore update', () => {
  it('should write the new values to the file and return them when updating', async () => {
    const store = make()
    await store.load()

    const result = await store.update({ fontSize: 20 })

    expect(result.settings.fontSize).toBe(20)
    expect(JSON.parse(await readFile(file, 'utf8')).fontSize).toBe(20)
    expect(result.fresh).toBe(false)
  })

  it('should not write the environment overrides to the file when updating something else', async () => {
    const store = make({ DCK_KEY: 'F8' })
    await store.load()

    await store.update({ theme: 'light' })

    expect(JSON.parse(await readFile(file, 'utf8')).shortcuts.toggleWindow).toBe('F12')
  })

  it('should tell the listeners what changed when a value changes', async () => {
    const store = make()
    await store.load()
    const seen: string[][] = []
    store.onChange((_settings, changed) => seen.push([...changed]))

    await store.update({ theme: 'light', window: { heightRatio: 0.8 } })

    expect(seen).toEqual([['theme', 'window.heightRatio']])
  })

  it('should not notify anyone when the patch changes nothing', async () => {
    const store = make()
    await store.load()
    let calls = 0
    store.onChange(() => {
      calls += 1
    })

    await store.update({ theme: 'dark' })

    expect(calls).toBe(0)
  })

  it('should stop notifying a listener after it unsubscribes', async () => {
    const store = make()
    await store.load()
    let calls = 0
    const off = store.onChange(() => {
      calls += 1
    })
    off()

    await store.update({ theme: 'light' })

    expect(calls).toBe(0)
  })

  it('should put a rejected change back to its previous value and report it when the veto refuses', async () => {
    const store = make({}, async (_next, changed) =>
      changed.includes('shortcuts.toggleWindow') ? ['shortcuts.toggleWindow'] : [],
    )
    await store.load()

    const result = await store.update({ shortcuts: { toggleWindow: 'F5' }, theme: 'light' })

    expect(result.rejected).toEqual(['shortcuts.toggleWindow'])
    expect(result.settings.shortcuts.toggleWindow).toBe('F12')
    expect(result.settings.theme).toBe('light')
    expect(JSON.parse(await readFile(file, 'utf8')).shortcuts.toggleWindow).toBe('F12')
  })

  it('should clamp a patched value when it is out of range', async () => {
    const store = make()
    await store.load()

    expect((await store.update({ opacity: 0.1 })).settings.opacity).toBe(0.3)
  })
})
