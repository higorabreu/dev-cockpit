import { createTranslator } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { workBadge } from './work-badge.ts'

describe('workBadge', () => {
  it('should show no badge when nothing waits', () => {
    expect(workBadge(createTranslator('en'), { review: 0, attention: 0 })).toBeUndefined()
  })

  it.each([
    { locale: 'en' as const, expected: '3 to review, 1 of yours needs attention' },
    { locale: 'pt-BR' as const, expected: '3 para revisar, 1 seu requer atenção' },
  ])(
    'should add both counts and name each in $locale when both have items',
    ({ locale, expected }) => {
      const badge = workBadge(createTranslator(locale), { review: 3, attention: 1 })

      expect(badge).toEqual({ count: 4, detail: expected })
    },
  )

  it.each([
    { locale: 'en' as const, expected: '2 of yours need attention' },
    { locale: 'pt-BR' as const, expected: '2 seus requerem atenção' },
  ])(
    'should name only the user own merge requests in $locale when there is nothing to review',
    ({ locale, expected }) => {
      const badge = workBadge(createTranslator(locale), { review: 0, attention: 2 })

      expect(badge).toEqual({ count: 2, detail: expected })
    },
  )

  it('should name only the reviews when none of the user own merge requests needs them', () => {
    const badge = workBadge(createTranslator('en'), { review: 12, attention: 0 })

    expect(badge).toEqual({ count: 12, detail: '12 to review' })
  })
})
