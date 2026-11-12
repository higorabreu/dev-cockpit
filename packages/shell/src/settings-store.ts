import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  changedKeys,
  defaultSettings,
  type Logger,
  mergeSettings,
  parseSettings,
  type Settings,
  type SettingsPatch,
  type SettingsUpdate,
  type SettingsView,
} from '@dck/core'
import { applyEnvOverrides } from './env-overrides.ts'

export interface SettingsStoreOptions {
  readonly file: string
  readonly logger: Logger
  readonly env: Readonly<Record<string, string | undefined>>
  // Decide se uma mudança pode valer; devolve as chaves que devem voltar ao valor anterior
  veto?(next: Settings, changed: readonly string[]): Promise<readonly string[]> | readonly string[]
}

type Listener = (settings: Settings, changed: readonly string[]) => void

// Monta um patch aninhado só com as chaves pedidas, tiradas de `source`
function pick(source: Settings, keys: readonly string[]): SettingsPatch {
  const patch: Record<string, unknown> = {}
  for (const key of keys) {
    const path = key.split('.')
    let target = patch
    let from: unknown = source
    for (const [index, part] of path.entries()) {
      from = (from as Record<string, unknown>)[part]
      if (index === path.length - 1) target[part] = from
      else {
        const child = (target[part] ?? {}) as Record<string, unknown>
        target[part] = child
        target = child
      }
    }
  }
  return patch as SettingsPatch
}

export function createSettingsStore(options: SettingsStoreOptions) {
  const { file, logger, env } = options
  const listeners = new Set<Listener>()
  // O que está no arquivo; as variáveis de ambiente não são gravadas nele
  let stored: Settings = defaultSettings
  let fresh = true
  let view: SettingsView = { settings: defaultSettings, locked: [], fresh: true }

  function recompute() {
    const { settings, locked } = applyEnvOverrides(stored, env)
    view = { settings, locked, fresh }
  }

  async function persist() {
    try {
      await mkdir(dirname(file), { recursive: true })
      // Escreve ao lado e renomeia, para nunca deixar o arquivo pela metade
      const temporary = `${file}.tmp`
      await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`)
      await rename(temporary, file)
    } catch (error) {
      logger.error('could not save settings', { file, error: String(error) })
    }
  }

  return {
    async load(): Promise<SettingsView> {
      const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT')
          logger.warn('settings file unreadable', { file, code: error.code })
        return undefined
      })
      fresh = text === undefined
      let raw: unknown
      try {
        raw = text === undefined ? undefined : JSON.parse(text)
      } catch {
        logger.warn('settings file is not valid json, using the defaults', { file })
      }
      stored = parseSettings(raw)
      recompute()
      return view
    },
    get: (): SettingsView => view,
    async update(patch: SettingsPatch): Promise<SettingsUpdate> {
      const before = view.settings
      let next = mergeSettings(stored, patch)
      let changed = changedKeys(stored, next)
      let rejected: readonly string[] = []
      if (changed.length > 0 && options.veto) {
        const candidate = applyEnvOverrides(next, env).settings
        rejected = await options.veto(candidate, changedKeys(before, candidate))
        if (rejected.length > 0) {
          next = mergeSettings(next, pick(stored, rejected))
          changed = changedKeys(stored, next)
        }
      }
      stored = next
      fresh = false
      recompute()
      if (changed.length > 0) await persist()
      const effective = changedKeys(before, view.settings)
      if (effective.length > 0) for (const listener of listeners) listener(view.settings, effective)
      return { ...view, rejected }
    },
    onChange(listener: Listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
