import { type Locale, pickLocale } from '@dck/core'

// The user's choice wins over the system language
export function localeFor(setting: 'auto' | Locale, systemLanguages: readonly string[]): Locale {
  return setting === 'auto' ? pickLocale(systemLanguages) : setting
}
