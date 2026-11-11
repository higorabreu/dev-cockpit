import { describe, expect, it } from 'vitest'
import { catalogs, createLiveTranslator, createTranslator, pickLocale } from './translator.ts'

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

  it('should fall back to portuguese when no language is known', () => {
    expect(pickLocale(['ja-JP'])).toBe('pt-BR')
    expect(pickLocale([])).toBe('pt-BR')
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
