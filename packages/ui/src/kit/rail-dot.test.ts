// @vitest-environment happy-dom
import { createTranslator } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { showRailDot } from './rail-dot.ts'

describe('showRailDot', () => {
  it('should draw a dot and keep the tooltip to the title when something waits', () => {
    const button = document.createElement('button')

    showRailDot(button, createTranslator('en'), 'Sessions', 3)

    expect(button.querySelectorAll('.rail-dot')).toHaveLength(1)
    expect(button.dataset.tip).toBe('Sessions')
  })

  it.each([
    { locale: 'en' as const, title: 'Work', count: 1, expected: 'Work, 1 item waiting' },
    { locale: 'en' as const, title: 'Work', count: 12, expected: 'Work, 12 items waiting' },
    {
      locale: 'pt-BR' as const,
      title: 'Trabalho',
      count: 1,
      expected: 'Trabalho, 1 item aguardando',
    },
    {
      locale: 'pt-BR' as const,
      title: 'Trabalho',
      count: 4,
      expected: 'Trabalho, 4 itens aguardando',
    },
  ])(
    'should give the screen reader the count in $locale when $count waits',
    ({ locale, title, count, expected }) => {
      const button = document.createElement('button')

      showRailDot(button, createTranslator(locale), title, count)

      expect(button.getAttribute('aria-label')).toBe(expected)
    },
  )

  it('should keep a single dot when shown again with another count', () => {
    const button = document.createElement('button')
    const i18n = createTranslator('en')
    showRailDot(button, i18n, 'Work', 1)

    showRailDot(button, i18n, 'Work', 2)

    expect(button.querySelectorAll('.rail-dot')).toHaveLength(1)
  })

  it('should remove the dot and leave only the title when nothing waits any more', () => {
    const button = document.createElement('button')
    const i18n = createTranslator('en')
    showRailDot(button, i18n, 'Work', 1)

    showRailDot(button, i18n, 'Work', 0)

    expect(button.querySelector('.rail-dot')).toBeNull()
    expect(button.dataset.tip).toBe('Work')
    expect(button.getAttribute('aria-label')).toBe('Work')
  })
})
