import type { HostApi, Settings, SettingsPatch, SettingsUpdate, Unsubscribe } from '@dck/core'

export interface SettingsClient {
  current(): Settings
  // Chaves fixadas por uma variável de ambiente: a tela não deixa mudar
  locked(): readonly string[]
  update(patch: SettingsPatch): Promise<SettingsUpdate>
  onChange(listener: (settings: Settings, changed: readonly string[]) => void): Unsubscribe
}

const LEGACY_KEYS = ['dck-theme', 'dck-opacity', 'dck-font-size', 'dck-locale'] as const

type Reader = (key: string) => string | null

// Antes das configurações, tema, opacidade, fonte e língua ficavam no localStorage. Na primeira
// execução sem arquivo, o que estiver lá vira o ponto de partida, para ninguém perder a escolha
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
  // Depois de migrar (ou se já havia arquivo) as chaves antigas não servem mais
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
