import { join } from 'node:path'
import { createFileExtensionFinder } from '@dck/adapter-extension-files'
import { EXTENSION_API_VERSION, type Logger, parseSettings } from '@dck/core'
import type { ExtDeps } from './ext-commands.ts'

export interface ExtDepsOptions {
  // The window's data folder, where settings.json and the extensions folder live
  readonly configDir: string
  // The root of the current repository, or the current directory outside one
  readonly repositoryRoot: string
  readonly appVersion: string
  readonly logger: Logger
  readFile(path: string): Promise<string | undefined>
}

// Undefined when the text is not JSON
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return undefined
  }
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
      const text = await options.readFile(settingsFile)
      // A corrupted settings file reads as the defaults, the same way the window treats it
      return new Set(parseSettings(text === undefined ? {} : parseJson(text)).extensions.disabled)
    },
  }
}
