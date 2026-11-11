import { en } from './en.ts'
import { type MessageKey, ptBR } from './pt-BR.ts'

export type Locale = 'pt-BR' | 'en'
export type Params = Readonly<Record<string, string | number>>
export type Translate = (key: MessageKey, params?: Params) => string
// Chaves que existem no plural: `chave.one` e `chave.other`
export type PluralKey = MessageKey extends infer K
  ? K extends `${infer B}.other`
    ? B
    : never
  : never

export const catalogs: Record<Locale, Readonly<Record<MessageKey, string>>> = { 'pt-BR': ptBR, en }

export interface Translator {
  readonly locale: Locale
  t: Translate
  plural(key: PluralKey, count: number, params?: Params): string
}

const interpolate = (template: string, params: Params | undefined) =>
  template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params && name in params ? String(params[name]) : match,
  )

export function createTranslator(locale: Locale): Translator {
  const rules = new Intl.PluralRules(locale)
  const catalog = catalogs[locale]
  const t: Translate = (key, params) => interpolate(catalog[key], params)
  return {
    locale,
    t,
    plural(key, count, params) {
      const category = rules.select(count)
      const specific = `${key}.${category}` as MessageKey
      const chosen = specific in catalog ? specific : (`${key}.other` as MessageKey)
      return t(chosen, { count, ...params })
    },
  }
}

// Língua do sistema, com o português como padrão quando não há correspondência
export function pickLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const lower = language.toLowerCase()
    if (lower.startsWith('pt')) return 'pt-BR'
    if (lower.startsWith('en')) return 'en'
  }
  return 'pt-BR'
}
