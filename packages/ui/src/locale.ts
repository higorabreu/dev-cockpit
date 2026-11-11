import { type Locale, pickLocale } from '@dck/core'

const STORAGE_KEY = 'dck-locale'

// A escolha do usuário vale mais que a língua do sistema; a tela de configurações vai gravá-la
export function currentLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'pt-BR' || stored === 'en') return stored
  } catch {
    // sem armazenamento, vale a língua do sistema
  }
  return pickLocale(navigator.languages)
}
