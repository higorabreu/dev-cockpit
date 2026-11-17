import { describe, expect, it } from 'vitest'
import {
  catalogs,
  createLiveTranslator,
  createTranslator,
  environmentLanguages,
  localeFor,
  pickLocale,
} from './translator.ts'

describe('createTranslator', () => {
  it('should return the text of the locale when translating a key', () => {
    expect(createTranslator('pt-BR').t('git.changes')).toBe('Alterações')
    expect(createTranslator('en').t('git.changes')).toBe('Changes')
  })

  it('should fill the parameters when the text has placeholders', () => {
    expect(createTranslator('en').t('sessions.busy', { process: 'pnpm' })).toBe('Running pnpm')
  })

  it('should keep a placeholder visible when its parameter is missing', () => {
    expect(createTranslator('en').t('sessions.busy')).toBe('Running {process}')
  })

  it('should pick the singular form when the count is one', () => {
    expect(createTranslator('pt-BR').plural('sessions.count', 1)).toBe('1 aba')
    expect(createTranslator('en').plural('sessions.count', 1)).toBe('1 tab')
  })

  it('should pick the plural form when the count is not one', () => {
    expect(createTranslator('pt-BR').plural('sessions.count', 3)).toBe('3 abas')
    expect(createTranslator('en').plural('git.summary', 0)).toBe('0 changes')
  })
})

describe('catalogs', () => {
  it('should have the same keys in every language when the catalogs are compared', () => {
    const reference = Object.keys(catalogs['pt-BR']).sort()

    expect(Object.keys(catalogs.en).sort()).toEqual(reference)
  })

  it('should use the same placeholders in every language when the texts are compared', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

    for (const [key, text] of Object.entries(catalogs['pt-BR'])) {
      const other = (catalogs.en as Record<string, string>)[key] ?? ''
      expect(placeholders(other), key).toEqual(placeholders(text))
    }
  })

  it('should give every plural base both forms when it has a plural', () => {
    for (const locale of ['pt-BR', 'en'] as const) {
      const keys = Object.keys(catalogs[locale])
      for (const key of keys.filter((entry) => entry.endsWith('.other'))) {
        expect(keys).toContain(key.replace(/\.other$/, '.one'))
      }
    }
  })
})

describe('pickLocale', () => {
  it('should pick portuguese when the system language is a portuguese variant', () => {
    expect(pickLocale(['pt-BR', 'en-US'])).toBe('pt-BR')
    expect(pickLocale(['pt-PT'])).toBe('pt-BR')
  })

  it('should pick english when the first known language is english', () => {
    expect(pickLocale(['de-DE', 'en-GB'])).toBe('en')
  })

  it('should fall back to english when no language has a catalog', () => {
    expect(pickLocale(['ja-JP'])).toBe('en')
    expect(pickLocale(['de-DE', 'fr-FR'])).toBe('en')
    expect(pickLocale([])).toBe('en')
  })
})

describe('localeFor', () => {
  it('should keep the language chosen in settings when it is not automatic', () => {
    expect(localeFor('pt-BR', ['en-US'])).toBe('pt-BR')
  })

  it('should follow the system when the setting is automatic', () => {
    expect(localeFor('auto', ['pt-BR'])).toBe('pt-BR')
    expect(localeFor('auto', ['de-DE'])).toBe('en')
  })
})

describe('environmentLanguages', () => {
  it('should read the message locale with LC_ALL before LC_MESSAGES and LANG', () => {
    expect(environmentLanguages({ LC_ALL: 'pt_BR.UTF-8', LANG: 'en_US.UTF-8' })).toEqual([
      'pt_BR.UTF-8',
    ])
    expect(environmentLanguages({ LC_MESSAGES: 'pt_BR.UTF-8', LANG: 'en_US.UTF-8' })).toEqual([
      'pt_BR.UTF-8',
    ])
  })

  it('should put the LANGUAGE list before the locale when the locale is not C', () => {
    expect(environmentLanguages({ LANGUAGE: 'pt_BR:en', LANG: 'de_DE.UTF-8' })).toEqual([
      'pt_BR',
      'en',
      'de_DE.UTF-8',
    ])
  })

  it('should ignore LANGUAGE when the locale is C, as gettext does', () => {
    expect(environmentLanguages({ LANGUAGE: 'pt_BR', LANG: 'C.UTF-8' })).toEqual(['C.UTF-8'])
    expect(environmentLanguages({ LANGUAGE: 'pt_BR' })).toEqual([])
  })
})

describe('createLiveTranslator', () => {
  it('should translate in the new language when the locale is switched', () => {
    const live = createLiveTranslator('pt-BR')

    live.setLocale('en')

    expect(live.t('git.changes')).toBe('Changes')
    expect(live.locale).toBe('en')
  })

  it('should translate in the new language for functions that were kept before the switch', () => {
    const live = createLiveTranslator('pt-BR')
    const { t, plural } = live

    live.setLocale('en')

    expect(t('git.changes')).toBe('Changes')
    expect(plural('sessions.count', 3)).toBe('3 tabs')
  })

  it('should keep translating the same when the locale is set to the current one', () => {
    const live = createLiveTranslator('en')

    live.setLocale('en')

    expect(live.t('git.changes')).toBe('Changes')
  })
})
