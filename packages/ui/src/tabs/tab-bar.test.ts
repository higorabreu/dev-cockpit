// @vitest-environment happy-dom
import { createTranslator, emptyTabs, openTab } from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createTabBar } from './tab-bar.ts'

function setup(language: 'en' | 'pt-BR' = 'en') {
  const container = document.createElement('div')
  document.body.append(container)
  const hidden: (string | undefined)[] = []
  const bar = createTabBar(
    container,
    {
      activate: () => undefined,
      contextMenu: () => undefined,
      reorder: () => undefined,
      hiddenAttention: (kind) => void hidden.push(kind),
    },
    createTranslator(language).t,
  )
  const state = openTab(openTab(emptyTabs, { id: 'tab-1', label: 'acme' }), {
    id: 'tab-2',
    label: 'shell 2',
  })
  return { container, bar, state, hidden }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('createTabBar review mark', () => {
  it('should mark a tab whose review is hidden behind its terminal with a named glyph and its key', () => {
    const { container, bar, state } = setup()

    bar.render(state, new Map(), new Set(['tab-1']))

    const mark = container.querySelector('[data-id="tab-1"] .pip.review')
    expect(mark?.getAttribute('role')).toBe('img')
    expect(mark?.getAttribute('aria-label')).toBe('Review open')
    expect(mark?.getAttribute('data-tip')).toBe('Review open')
    expect(mark?.getAttribute('data-tip-key')).toBe('Ctrl+Shift+D')
    expect(mark?.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('[data-id="tab-2"] .pip')).toBeNull()
  })

  it('should name the mark in portuguese when the interface is in portuguese', () => {
    const { container, bar, state } = setup('pt-BR')

    bar.render(state, new Map(), new Set(['tab-2']))

    expect(
      container.querySelector('[data-id="tab-2"] .pip.review')?.getAttribute('aria-label'),
    ).toBe('Revisão aberta')
  })

  it('should not count the review mark as attention when it sits out of view', () => {
    const { bar, state, hidden } = setup()

    bar.render(state, new Map(), new Set(['tab-1', 'tab-2']))

    expect(hidden.filter((kind) => kind !== undefined)).toEqual([])
  })

  it('should keep both marks when the tab also needs the user', () => {
    const { container, bar, state } = setup()

    bar.render(state, new Map([['tab-1', 'needs-you']]), new Set(['tab-1']))

    expect(
      [...container.querySelectorAll('[data-id="tab-1"] .pip')].map((pip) => pip.className),
    ).toEqual(['pip needs-you', 'pip review'])
  })
})
