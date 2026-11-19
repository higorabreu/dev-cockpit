import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsoncSettingsText } from '@dck/adapter-jsonc'
import { defaultSettings, type SettingsFileState, silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettingsStore } from './settings-store.ts'

let directory = ''
let file = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-settings-'))
  file = join(directory, 'nested', 'settings.json')
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const folders = new Set(['/home/ana/code'])

const make = (
  env: Record<string, string> = {},
  veto?: Parameters<typeof createSettingsStore>[0]['veto'],
) =>
  createSettingsStore({
    file,
    logger: silentLogger,
    env,
    text: createJsoncSettingsText(),
    isFolder: async (path) => folders.has(path),
    ...(veto ? { veto } : {}),
  })

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
    expect(view.settings.opacity).toBe(1)
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

  it('should keep a value another program wrote to the file when updating something else', async () => {
    const store = make()
    await store.load()
    await store.update({ fontSize: 20 })
    const edited = {
      ...JSON.parse(await readFile(file, 'utf8')),
      extensions: { disabled: ['acme.commits'] },
    }
    await writeFile(file, JSON.stringify(edited))

    const result = await store.update({ theme: 'light' })

    expect(result.settings.extensions.disabled).toEqual(['acme.commits'])
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      theme: 'light',
      fontSize: 20,
      extensions: { disabled: ['acme.commits'] },
    })
  })

  it('should keep the settings and leave the file untouched when it became invalid before an update', async () => {
    const store = make()
    await store.load()
    await store.update({ fontSize: 20 })
    await writeFile(file, '{\n  "fontSize": 20\n  "theme": "light"\n}\n')

    const result = await store.update({ opacity: 0.5 })

    expect(result.settings.fontSize).toBe(20)
    expect(result.settings.opacity).toBe(1)
    expect(result.rejected).toEqual(['opacity'])
    expect(result.file).toEqual({ kind: 'invalid', line: 3, column: 3 })
    expect(await readFile(file, 'utf8')).toBe('{\n  "fontSize": 20\n  "theme": "light"\n}\n')
  })

  it('should keep the comments, order and layout of the file when the screen changes a value', async () => {
    const original =
      '{\n  // Dark at night\n  "theme": "dark", /* mine */\n  "fontSize": 14,\n  "system": { "notifyAfterSeconds": 60 },\n}\n'
    await writeFile(join(directory, 'settings.json'), original)
    file = join(directory, 'settings.json')
    const store = make()
    await store.load()

    await store.update({ fontSize: 18, window: { heightRatio: 0.6 } })

    expect(await readFile(file, 'utf8')).toBe(
      '{\n  // Dark at night\n  "theme": "dark", /* mine */\n  "fontSize": 18,\n  "system": { "notifyAfterSeconds": 60 },\n  "window": {\n    "heightRatio": 0.6\n  },\n}\n',
    )
  })

  it('should write every value as plain json when there was no file', async () => {
    const store = make()
    await store.load()

    await store.update({ theme: 'light' })

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ ...defaultSettings, theme: 'light' })
  })

  it('should report a projects folder that does not exist when the screen saves it', async () => {
    const store = make()
    await store.load()

    const result = await store.update({ projects: { root: '/home/ana/gone' } })

    expect(result.settings.projects.root).toBe('/home/ana/gone')
    expect(result.file).toEqual({
      kind: 'ok',
      issues: [{ key: 'projects.root', kind: 'missingFolder', found: '"/home/ana/gone"' }],
    })
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

describe('createSettingsStore reload', () => {
  const editFile = async (change: Record<string, unknown>) => {
    const current = JSON.parse(await readFile(file, 'utf8'))
    await writeFile(file, JSON.stringify({ ...current, ...change }))
  }

  const started = async (...args: Parameters<typeof make>) => {
    const store = make(...args)
    await store.load()
    await store.update({ fontSize: 20 })
    const seen: (readonly string[])[] = []
    const states: SettingsFileState[] = []
    store.onChange((_settings, changed) => seen.push(changed))
    store.onFile((state) => states.push(state))
    return { store, seen, states }
  }

  it('should apply any field edited by hand and tell the listeners when the file changed', async () => {
    const { store, seen } = await started()
    await editFile({ theme: 'light', language: 'en', fontSize: 12 })

    await store.reload()

    expect(store.get().settings).toMatchObject({ theme: 'light', language: 'en', fontSize: 12 })
    expect(seen).toEqual([['language', 'theme', 'fontSize']])
  })

  it('should apply the disabled extensions the CLI wrote when the file changed', async () => {
    const { store, seen } = await started()
    await editFile({ extensions: { disabled: ['dck.gitlab'] } })

    await store.reload()

    expect(store.get().settings.extensions.disabled).toEqual(['dck.gitlab'])
    expect(seen).toEqual([['extensions.disabled']])
  })

  it('should tell nobody when the file holds what the window itself saved', async () => {
    const { store, seen, states } = await started()
    await store.update({ theme: 'light' })
    seen.length = 0

    await store.reload()

    expect(seen).toEqual([])
    expect(states).toEqual([])
  })

  it('should keep the settings, say where the file broke and not rewrite it when it is not valid', async () => {
    const { store, seen, states } = await started()
    await writeFile(file, '{\n  "theme": "light",\n  oops\n}\n')

    await store.reload()

    expect(store.get().settings.fontSize).toBe(20)
    expect(seen).toEqual([])
    expect(states).toEqual([{ kind: 'invalid', line: 3, column: 3 }])
    expect(await readFile(file, 'utf8')).toBe('{\n  "theme": "light",\n  oops\n}\n')
  })

  it('should apply the file and clear the error when the user fixes it', async () => {
    const { store, seen, states } = await started()
    await writeFile(file, '{ "theme": "light", oops }')
    await store.reload()

    await writeFile(file, '{ "theme": "light", // fixed\n}')
    await store.reload()

    expect(store.get().settings.theme).toBe('light')
    expect(seen).toEqual([['theme', 'fontSize']])
    expect(states.at(-1)).toEqual({ kind: 'ok', issues: [] })
  })

  it('should write the default over a wrong value when the screen resets a setting already at its default', async () => {
    // Arrange
    const { store } = await started()
    await editFile({ theme: 'purple', fontSize: 14 })
    await store.reload()

    // Act
    await store.update({ theme: 'dark' })

    // Assert
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ theme: 'dark', fontSize: 14 })
    expect(store.get().file).toEqual({ kind: 'ok', issues: [] })
  })

  it('should list the values it did not use as written when the file has them', async () => {
    const { store } = await started()
    await editFile({ theme: 'purple', system: { notifyAfterSeconds: 2 } })

    await store.reload()

    expect(store.get().file).toEqual({
      kind: 'ok',
      issues: [
        { key: 'theme', kind: 'ignored', found: '"purple"', used: '"dark"' },
        { key: 'system.notifyAfterSeconds', kind: 'adjusted', found: '2', used: '5' },
      ],
    })
  })

  it('should keep the previous shortcut and report it without rewriting the file when the system refuses the new one', async () => {
    const { store, seen } = await started({}, (_next, changed) =>
      changed.includes('shortcuts.toggleWindow') ? ['shortcuts.toggleWindow'] : [],
    )
    await editFile({ shortcuts: { toggleWindow: 'F5' }, theme: 'light' })

    await store.reload()

    expect(store.get().settings.shortcuts.toggleWindow).toBe('F12')
    expect(store.get().settings.theme).toBe('light')
    expect(seen).toEqual([['theme']])
    expect(store.get().file).toEqual({
      kind: 'ok',
      issues: [{ key: 'shortcuts.toggleWindow', kind: 'refused', found: '"F5"', used: '"F12"' }],
    })
    expect(JSON.parse(await readFile(file, 'utf8')).shortcuts.toggleWindow).toBe('F5')
  })

  it('should take the shortcut and stop reporting it when the system accepts it on a later save', async () => {
    let free = false
    const { store } = await started({}, (_next, changed) =>
      changed.includes('shortcuts.toggleWindow') && !free ? ['shortcuts.toggleWindow'] : [],
    )
    await editFile({ shortcuts: { toggleWindow: 'F5' } })
    await store.reload()
    free = true

    await editFile({ theme: 'light' })
    await store.reload()

    expect(store.get().settings.shortcuts.toggleWindow).toBe('F5')
    expect(store.get().file).toEqual({ kind: 'ok', issues: [] })
  })

  it('should go back to the defaults when the file is deleted', async () => {
    const { store, seen } = await started()
    await rm(file)

    await store.reload()

    expect(store.get().settings).toEqual(defaultSettings)
    expect(seen).toEqual([['fontSize']])
  })
})

describe('createSettingsStore ensureFile', () => {
  it('should write the settings in use when there is no file to open', async () => {
    const store = make()
    await store.load()

    expect(await store.ensureFile()).toBe(true)

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(defaultSettings)
  })

  it('should tell the window where the file is when it reads the settings', async () => {
    // Arrange
    const store = make()

    // Act
    const view = await store.load()

    // Assert
    expect(view.path).toBe(file)
    expect(store.get().path).toBe(file)
  })

  it('should leave the file as it is when one exists', async () => {
    await make().update({ theme: 'light' })
    await writeFile(file, '// mine\n{}')
    const store = make()
    await store.load()

    await store.ensureFile()

    expect(await readFile(file, 'utf8')).toBe('// mine\n{}')
  })
})
