import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsoncSettingsText } from '@dck/adapter-jsonc'
import { silentLogger, type ThemeFile, type UserThemes } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createThemeStore } from './theme-store.ts'

let directory = ''
let folder = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-themes-'))
  folder = join(directory, 'themes')
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const make = () =>
  createThemeStore({ folder, text: createJsoncSettingsText(), logger: silentLogger })

const dusk: ThemeFile = {
  name: 'Dusk',
  type: 'dark',
  colors: { bg: '#101418' },
  terminal: {},
  syntax: { comment: '#8a93b8' },
}

async function put(name: string, content: string) {
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, name), content)
}

describe('createThemeStore', () => {
  it('should list no theme when the folder does not exist', async () => {
    const themes = await make().list()

    expect(themes).toEqual({ folder, themes: [] })
  })

  it('should read each json file with its comments and its issues when the folder has themes', async () => {
    await put(
      'dusk.json',
      '// Mine\n{ "name": "Dusk", "type": "light", "colors": { "bg": "nope" }, }',
    )
    await put('notes.txt', 'not a theme')

    const { themes } = await make().list()

    expect(themes).toEqual([
      {
        file: 'dusk.json',
        path: join(folder, 'dusk.json'),
        theme: { name: 'Dusk', type: 'light', colors: {}, terminal: {}, syntax: {} },
        issues: [{ key: 'colors.bg', kind: 'ignored', found: '"nope"' }],
      },
    ])
  })

  it('should keep the last good theme and say where it broke when a save leaves the file invalid', async () => {
    await put('dusk.json', JSON.stringify(dusk))
    const store = make()
    await store.load()
    await put('dusk.json', '{ "name": "Dusk", ')

    await store.reload()
    const [theme] = (await store.list()).themes

    expect(theme?.theme).toEqual(dusk)
    expect(theme?.invalid).toEqual({ line: 1, column: expect.any(Number) })
  })

  it('should tell its listeners once when a reload finds a change', async () => {
    const store = make()
    await store.load()
    const heard: UserThemes[] = []
    store.onChange((themes) => heard.push(themes))
    await put('dusk.json', JSON.stringify(dusk))

    await store.reload()
    await store.reload()

    expect(heard).toHaveLength(1)
    expect(heard[0]?.themes.map((theme) => theme.file)).toEqual(['dusk.json'])
  })

  it('should write a new file named after the theme without replacing one when creating a theme', async () => {
    await put('dusk.json', '{}')
    const store = make()

    const location = await store.create(dusk)

    expect(location).toEqual({ path: join(folder, 'dusk-2.json'), folder })
    expect(JSON.parse(await readFile(join(folder, 'dusk-2.json'), 'utf8'))).toEqual(dusk)
    expect(await readFile(join(folder, 'dusk.json'), 'utf8')).toBe('{}')
    expect((await store.list()).themes.map((theme) => theme.file)).toEqual([
      'dusk-2.json',
      'dusk.json',
    ])
  })
})
