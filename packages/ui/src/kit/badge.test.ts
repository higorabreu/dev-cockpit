// @vitest-environment happy-dom
import { createTranslator } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { showBadge } from './badge.ts'

const pillOf = (button: HTMLElement) => button.querySelector('.badge')?.textContent

describe('showBadge', () => {
  it('should draw the count and say it in full in the tooltip and label when there is one', () => {
    const button = document.createElement('button')
    const { t } = createTranslator('en')

    showBadge(button, t, 'Sessions', { count: 3, detail: '3 waiting for you' })

    expect(pillOf(button)).toBe('3')
    expect(button.dataset.tip).toBe('Sessions · 3 waiting for you')
    expect(button.getAttribute('aria-label')).toBe('Sessions · 3 waiting for you')
  })

  it('should cap the pill at 9+ and keep the exact count in the tooltip when the count is over 9', () => {
    const button = document.createElement('button')
    const { t } = createTranslator('pt-BR')

    showBadge(button, t, 'Sessões', { count: 12, detail: '12 aguardando você' })

    expect(pillOf(button)).toBe('9+')
    expect(button.dataset.tip).toBe('Sessões · 12 aguardando você')
  })

  it('should keep a single pill and update it when shown again', () => {
    const button = document.createElement('button')
    const { t } = createTranslator('en')
    showBadge(button, t, 'Work', { count: 1, detail: '1 to review' })

    showBadge(button, t, 'Work', { count: 2, detail: '2 to review' })

    expect(button.querySelectorAll('.badge')).toHaveLength(1)
    expect(pillOf(button)).toBe('2')
  })

  it('should remove the pill and leave only the title when the count drops to zero', () => {
    const button = document.createElement('button')
    const { t } = createTranslator('en')
    showBadge(button, t, 'Work', { count: 1, detail: '1 to review' })

    showBadge(button, t, 'Work', undefined)

    expect(button.querySelector('.badge')).toBeNull()
    expect(button.dataset.tip).toBe('Work')
    expect(button.getAttribute('aria-label')).toBe('Work')
  })
})
