import { join } from 'node:path'
import { createFileExtensionFinder } from '@dck/adapter-extension-files'
import {
  EXTENSION_API_VERSION,
  type Logger,
  mergeSettings,
  parseSettings,
  type SettingsText,
  settingsEdits,
} from '@dck/core'
import type { ExtDeps } from './ext-commands.ts'
import { settingsFromText } from './settings-file.ts'

export interface ExtDepsOptions {
  // The window's data folder, where settings.json and the extensions folder live
  readonly configDir: string
  // The root of the current repository, or the current directory outside one
  readonly repositoryRoot: string
  readonly appVersion: string
  readonly logger: Logger
  // Reads and edits settings.json as the window does, comments included
  readonly text: SettingsText
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
      return new Set(
        settingsFromText(options.text, await options.readFile(settingsFile)).extensions.disabled,
      )
    },
    // Only the list changes: the user's comments, order and other values stay as they are
    async saveDisabled(ids) {
      const content = await options.readFile(settingsFile)
      const read = content === undefined ? undefined : options.text.read(content)
      if (read?.kind === 'invalid') return { kind: 'invalid', file: settingsFile }
      const raw = read?.value ?? {}
      const before = parseSettings(raw)
      const next = mergeSettings(before, { extensions: { disabled: [...ids] } })
      const output =
        content === undefined
          ? `${JSON.stringify(next, null, 2)}\n`
          : options.text.edit(content, settingsEdits(raw, before, next))
      const written = await options.writeFile(settingsFile, output)
      return written ? { kind: 'saved' } : { kind: 'unwritable', file: settingsFile }
    },
  }
}
