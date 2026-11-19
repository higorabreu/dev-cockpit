import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { findRepositoryRoot } from '@dck/adapter-extension-files'
import { createJsoncSettingsText } from '@dck/adapter-jsonc'
import {
  createTranslator,
  environmentLanguages,
  localeFor,
  type SettingsText,
  silentLogger,
  type Translate,
} from '@dck/core'
import packageJson from '../package.json' with { type: 'json' }
import { type CliDeps, runCli } from './cli.ts'
import { createExtDeps } from './ext-deps.ts'
import { settingsFromText } from './settings-file.ts'

export interface FullCliOptions extends Omit<CliDeps, 't' | 'env' | 'ext'> {
  // The window's data folder, where settings.json and the extensions live
  readonly configDir: string
}

const readText = (path: string) => readFile(path, 'utf8').catch(() => undefined)

// The language chosen in the window's settings, else the terminal's
export async function translatorForUser(
  configDir: string,
  text: SettingsText = createJsoncSettingsText(),
): Promise<Translate> {
  const settings = settingsFromText(text, await readText(join(configDir, 'settings.json')))
  return createTranslator(localeFor(settings.language, environmentLanguages(process.env))).t
}

export async function runFullCli(
  args: readonly string[],
  options: FullCliOptions,
): Promise<number> {
  const { configDir, ...io } = options
  const settingsText = createJsoncSettingsText()
  return runCli(args, {
    ...io,
    t: await translatorForUser(configDir, settingsText),
    env: process.env,
    ext: createExtDeps({
      configDir,
      repositoryRoot: (await findRepositoryRoot(process.cwd())) ?? process.cwd(),
      appVersion: packageJson.version,
      logger: silentLogger,
      text: settingsText,
      readFile: readText,
      writeFile: async (path, text) => {
        const temporary = `${path}.tmp`
        return mkdir(dirname(path), { recursive: true })
          .then(() => writeFile(temporary, text))
          .then(() => rename(temporary, path))
          .then(
            () => true,
            () => false,
          )
      },
    }),
  })
}
