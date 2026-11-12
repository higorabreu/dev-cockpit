import type { HostApi, Settings, SettingsPatch, SettingsUpdate, Unsubscribe } from '@dck/core'

export interface SettingsClient {
  current(): Settings
  // Keys pinned by an environment variable: the screen does not let them change
  locked(): readonly string[]
  update(patch: SettingsPatch): Promise<SettingsUpdate>
  onChange(listener: (settings: Settings, changed: readonly string[]) => void): Unsubscribe
}

const LEGACY_KEYS = ['dck-theme', 'dck-opacity', 'dck-font-size', 'dck-locale'] as const

type Reader = (key: string) => string | null

// Before settings existed, theme, opacity, font and language lived in localStorage. On the first
// run with no file, whatever is there becomes the starting point, so nobody loses their choice
export function legacyPatch(read: Reader): SettingsPatch {
  const patch: Record<string, unknown> = {}
  const theme = read('dck-theme')
  if (theme === 'light' || theme === 'dark') patch.theme = theme
  const opacity = Number(read('dck-opacity'))
  if (read('dck-opacity') !== null && Number.isFinite(opacity)) patch.opacity = opacity
  const font = Number(read('dck-font-size'))
  if (read('dck-font-size') !== null && Number.isFinite(font)) patch.fontSize = font
  const language = read('dck-locale')
  if (language === 'pt-BR' || language === 'en') patch.language = language
  return patch as SettingsPatch
}

function safeStorage() {
  try {
    return localStorage
  } catch {
    return undefined
  }
}

export async function createSettingsClient(api: HostApi): Promise<SettingsClient> {
  let view = await api.settings.get()
  let current = view.settings
  let locked = view.locked

  const storage = safeStorage()
  if (view.fresh && storage) {
    const patch = legacyPatch((key) => storage.getItem(key))
    if (Object.keys(patch).length > 0) {
      const result = await api.settings.update(patch)
      current = result.settings
      locked = result.locked
    }
  }
  // After migrating (or if a file already existed) the old keys are no longer needed
  if (storage) for (const key of LEGACY_KEYS) storage.removeItem(key)

  const listeners = new Set<(settings: Settings, changed: readonly string[]) => void>()
  api.settings.onChange((settings, changed) => {
    current = settings
    for (const listener of listeners) listener(settings, changed)
  })
  view = { ...view, settings: current, locked }

  return {
    current: () => current,
    locked: () => locked,
    async update(patch) {
      const result = await api.settings.update(patch)
      current = result.settings
      locked = result.locked
      return result
    },
    onChange(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
