import { join } from 'node:path'
import { createFileExtensionFinder } from '@dck/adapter-extension-files'
import { EXTENSION_API_VERSION, type Logger, mergeSettings, parseSettings } from '@dck/core'
import type { ExtDeps } from './ext-commands.ts'
import { parseJson, settingsFromText } from './settings-file.ts'

export interface ExtDepsOptions {
  // The window's data folder, where settings.json and the extensions folder live
  readonly configDir: string
  // The root of the current repository, or the current directory outside one
  readonly repositoryRoot: string
  readonly appVersion: string
  readonly logger: Logger
  readFile(path: string): Promise<string | undefined>
  // Replaces the file as a whole (a temporary file, then a rename); false when it could not
  writeFile(path: string, text: string): Promise<boolean>
}

export function createExtDeps(options: ExtDepsOptions): ExtDeps {
  const { configDir, appVersion, logger } = options
  const settingsFile = join(configDir, 'settings.json')
  return {
    appVersion,
    finder: createFileExtensionFinder({
      installedDir: join(configDir, 'extensions'),
      globalDir: configDir,
      repositoryDir: join(options.repositoryRoot, '.dck'),
      // No contribution point has a folder of its own: connectors only come built in
      implicit: { apiVersion: EXTENSION_API_VERSION, appVersion, points: {} },
      logger,
    }),
    async disabled() {
      return new Set(settingsFromText(await options.readFile(settingsFile)).extensions.disabled)
    },
    // Written in the window's own format, so the next save there changes nothing else
    async saveDisabled(ids) {
      const text = await options.readFile(settingsFile)
      const raw = text === undefined ? {} : parseJson(text)
      if (raw === undefined) return { kind: 'invalid', file: settingsFile }
      const next = mergeSettings(parseSettings(raw), { extensions: { disabled: [...ids] } })
      const written = await options.writeFile(settingsFile, `${JSON.stringify(next, null, 2)}\n`)
      return written ? { kind: 'saved' } : { kind: 'unwritable', file: settingsFile }
    },
  }
}
