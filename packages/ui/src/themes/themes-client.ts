import type { HostApi, SettingsFileLocation, ThemeFile, Unsubscribe, UserThemes } from '@dck/core'
import { createThemeCatalog, type ThemeCatalog } from './theme-catalog.ts'

export interface ThemesClient {
  catalog(): ThemeCatalog
  // A theme file was added, saved or removed
  onChange(listener: (catalog: ThemeCatalog) => void): Unsubscribe
  // Writes a new file in the themes folder; undefined when the host could not
  create(theme: ThemeFile): Promise<SettingsFileLocation | undefined>
}

export async function createThemesClient(api: HostApi): Promise<ThemesClient> {
  let catalog = createThemeCatalog(await api.themes.list())
  const listeners = new Set<(catalog: ThemeCatalog) => void>()
  api.themes.onChange((themes) => {
    catalog = createThemeCatalog(themes)
    for (const listener of listeners) listener(catalog)
  })
  return {
    catalog: () => catalog,
    onChange(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    create: (theme) => api.themes.create(theme),
  }
}

// A client over a fixed list that writes nothing, for the screens' tests
export function fixedThemes(user: UserThemes): ThemesClient {
  const catalog = createThemeCatalog(user)
  return {
    catalog: () => catalog,
    onChange: () => () => undefined,
    create: async () => undefined,
  }
}
