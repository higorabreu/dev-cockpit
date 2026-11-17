// @vitest-environment happy-dom
import { createHoldMenu, createTranslator, type MenuCategory, navigate, select } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { wheelMarkup } from './menu-view.ts'

const { t } = createTranslator('en')

const category = (id: string, size: number): MenuCategory => ({
  id,
  label: id,
  icon: 'window',
  items: Array.from({ length: size }, (_, index) => ({
    id: `${id}:${index}`,
    label: `Item ${index}`,
  })),
})

const CATEGORIES = [category('tabs', 7), category('projects', 2), category('agent', 0)]

function render(selected: number, shown?: { start: number; size: number }) {
  const state = select(createHoldMenu(CATEGORIES), 0, selected)
  const card = document.createElement('div')
  card.innerHTML = wheelMarkup(state, t, shown).card
  const list = card.querySelector<HTMLElement>('.list')
  if (!list) throw new Error('invariant: a selected category has a list')
  return list
}

const visibleItems = (list: HTMLElement) =>
  [...list.querySelectorAll<HTMLElement>('.it:not(.gone)')].map((row) => row.dataset.item)

describe('wheelMarkup list', () => {
  it('should show every row without cues when no window is given', () => {
    // Arrange
    const selected = 0

    // Act
    const list = render(selected)

    // Assert
    expect(visibleItems(list)).toEqual(['0', '1', '2', '3', '4', '5', '6'])
    expect(list.querySelector('.cue')).toBeNull()
  })

  it('should show only the rows inside the window when the list is windowed', () => {
    const list = render(3, { start: 2, size: 3 })

    expect(visibleItems(list)).toEqual(['2', '3', '4'])
    expect(list.querySelector('.it.on')?.getAttribute('data-item')).toBe('3')
  })

  it('should keep the hidden rows without an item index when they only size the list', () => {
    const list = render(3, { start: 2, size: 3 })

    const gone = [...list.querySelectorAll<HTMLElement>('.it.gone')]

    expect(gone).toHaveLength(4)
    expect(gone.every((row) => row.dataset.item === undefined)).toBe(true)
  })

  it('should count the hidden rows on each side when the window is in the middle', () => {
    // Arrange
    const shown = { start: 2, size: 3 }

    // Act
    const cues = [...render(3, shown).querySelectorAll<HTMLElement>('button.cue')]

    // Assert
    expect(cues.map((cue) => cue.getAttribute('aria-label'))).toEqual([
      '2 more above',
      '2 more below',
    ])
    expect(cues.map((cue) => cue.dataset.reveal)).toEqual(['1', '5'])
  })

  it('should keep an empty slot above when the window starts at the first row', () => {
    const list = render(0, { start: 0, size: 3 })

    const slots = [...list.querySelectorAll<HTMLElement>('.cue')]

    expect(slots).toHaveLength(2)
    expect(slots[0]?.tagName).toBe('SPAN')
    expect(slots[1]?.getAttribute('data-tip')).toBe('4 more below')
  })

  it('should leave the cues out of the tab order when they are buttons', () => {
    const list = render(3, { start: 2, size: 3 })

    const cue = list.querySelector<HTMLElement>('button.cue')

    expect(cue?.getAttribute('tabindex')).toBe('-1')
  })

  it('should show the empty note when the category has no items', () => {
    const state = navigate(navigate(navigate(createHoldMenu(CATEGORIES), 'up'), 'right'), 'right')
    const card = document.createElement('div')

    card.innerHTML = wheelMarkup(state, t, { start: 0, size: 0 }).card

    expect(card.querySelector('.list .empty')).not.toBeNull()
    expect(card.querySelector('.cue')).toBeNull()
  })
})
