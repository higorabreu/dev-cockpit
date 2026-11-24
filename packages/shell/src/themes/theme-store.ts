import { access, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Logger,
  noUserThemes,
  parseThemeFile,
  type SettingsFileLocation,
  type SettingsText,
  type ThemeFile,
  themeFileBase,
  type UserTheme,
  type UserThemes,
} from '@dck/core'

export interface ThemeStoreOptions {
  // The themes folder beside settings.json; created by the first theme written
  readonly folder: string
  readonly text: SettingsText
  readonly logger: Logger
}

// A theme is a few kilobytes; past these the folder holds something else
const MAX_THEMES = 100
const MAX_BYTES = 256 * 1024
const EXTENSION = '.json'

const stem = (file: string) => file.slice(0, -EXTENSION.length)

export function createThemeStore(options: ThemeStoreOptions) {
  const { folder, text, logger } = options
  let current: UserThemes = noUserThemes(folder)
  let loaded: Promise<UserThemes> | undefined
  // The last version of each file that read as JSON with comments, kept while a save leaves it broken
  const lastGood = new Map<string, ThemeFile>()
  const listeners = new Set<(themes: UserThemes) => void>()
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task)
    queue = run.catch(() => undefined)
    return run
  }

  async function files(): Promise<string[]> {
    try {
      const names = await readdir(folder)
      return names
        .filter((name) => name.endsWith(EXTENSION))
        .sort()
        .slice(0, MAX_THEMES)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') logger.warn('themes folder unreadable', { folder, code })
      return []
    }
  }

  async function readOne(file: string): Promise<UserTheme | undefined> {
    const path = join(folder, file)
    try {
      if ((await stat(path)).size > MAX_BYTES) {
        logger.warn('theme file too large, left out', { file })
        return undefined
      }
      const read = text.read(await readFile(path, 'utf8'))
      if (read.kind === 'invalid') {
        const kept = lastGood.get(file)
        return kept
          ? { file, path, theme: kept, issues: [], invalid: read.at }
          : { file, path, issues: [], invalid: read.at }
      }
      const { theme, issues } = parseThemeFile(read.value, stem(file))
      lastGood.set(file, theme)
      return { file, path, theme, issues }
    } catch (error) {
      // Removed between the listing and the read, or not a file
      logger.warn('theme file unreadable', { file, error: String(error) })
      return undefined
    }
  }

  async function read(): Promise<UserThemes> {
    const names = await files()
    for (const file of lastGood.keys()) if (!names.includes(file)) lastGood.delete(file)
    const themes = (await Promise.all(names.map(readOne))).filter(
      (theme): theme is UserTheme => theme !== undefined,
    )
    return { folder, themes }
  }

  async function freeName(theme: ThemeFile): Promise<string> {
    const base = themeFileBase(theme.name)
    for (let index = 1; ; index += 1) {
      const name = `${index === 1 ? base : `${base}-${index}`}${EXTENSION}`
      const taken = await access(join(folder, name)).then(
        () => true,
        () => false,
      )
      if (!taken) return name
    }
  }

  function adopt(next: UserThemes) {
    const changed = JSON.stringify(next) !== JSON.stringify(current)
    current = next
    if (changed) for (const listener of listeners) listener(current)
  }

  // Started once, on start; every list waits for it
  const load = (): Promise<UserThemes> => {
    loaded ??= serial(async () => {
      current = await read()
      return current
    })
    return loaded
  }

  return {
    load,
    list: (): Promise<UserThemes> => load().then(() => current),
    // The folder changed on disk: a save, a new file, a removal
    reload(): Promise<void> {
      return serial(async () => adopt(await read()))
    },
    // A new file named after the theme, never over another; written beside it and renamed
    create(theme: ThemeFile): Promise<SettingsFileLocation | undefined> {
      return serial(async () => {
        try {
          await mkdir(folder, { recursive: true })
          const path = join(folder, await freeName(theme))
          const temporary = `${path}.tmp`
          await writeFile(temporary, `${JSON.stringify(theme, null, 2)}\n`)
          await rename(temporary, path)
          logger.info('theme written', { file: path })
          adopt(await read())
          return { path, folder }
        } catch (error) {
          logger.error('could not write theme', { folder, error: String(error) })
          return undefined
        }
      })
    },
    onChange(listener: (themes: UserThemes) => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
