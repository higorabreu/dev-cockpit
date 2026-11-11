import { type Locale, pickLocale } from '@dck/core'

// A escolha do usuário vale mais que a língua do sistema
export function localeFor(setting: 'auto' | Locale, systemLanguages: readonly string[]): Locale {
  return setting === 'auto' ? pickLocale(systemLanguages) : setting
}
