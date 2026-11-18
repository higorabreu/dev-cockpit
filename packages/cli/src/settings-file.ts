import { parseSettings, type Settings, type SettingsText } from '@dck/core'

// The window's settings.json; a missing or broken file reads as the defaults, as the window treats it
export function settingsFromText(text: SettingsText, content: string | undefined): Settings {
  const read = content === undefined ? undefined : text.read(content)
  return parseSettings(read?.kind === 'ok' ? read.value : {})
}
