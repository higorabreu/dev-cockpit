import { describe, expect, it } from 'vitest'
import {
  CENTER,
  createHoldMenu,
  currentCategory,
  currentItem,
  type MenuCategory,
  navigate,
  release,
  replaceItems,
  sectorFor,
  select,
} from './hold-menu.ts'

const categories: readonly MenuCategory[] = [
  {
    id: 'tabs',
    label: 'Abas',
    icon: 'window',
    items: [
      { id: 'new-tab', label: 'Nova aba' },
      { id: 'close-tab', label: 'Fechar aba' },
    ],
  },
  {
    id: 'projects',
    label: 'Projetos',
    icon: 'folder',
    items: [
      { id: 'backend', label: 'backend' },
      { id: 'frontend', label: 'frontend' },
      { id: 'ops', label: 'ops' },
    ],
  },
  { id: 'agent', label: 'Agente', icon: 'terminal', items: [{ id: 'claude', label: 'Claude' }] },
  { id: 'system', label: 'Sistema', icon: 'sliders', items: [{ id: 'theme', label: 'Tema' }] },
]

describe('createHoldMenu', () => {
  it('should start at the center with no category and no item when the menu is created', () => {
    const menu = createHoldMenu(categories)

    expect(menu.category).toBe(CENTER)
    expect(currentCategory(menu)).toBeUndefined()
    expect(currentItem(menu)).toBeUndefined()
    expect(menu.touched).toBe(false)
  })

  it('should reject a menu without categories when the menu is created', () => {
    expect(() => createHoldMenu([])).toThrow()
  })
})

describe('sectorFor', () => {
  it('should pick the sector in that direction when the menu has four sectors', () => {
    expect(sectorFor('up', 4)).toBe(0)
    expect(sectorFor('right', 4)).toBe(1)
    expect(sectorFor('down', 4)).toBe(2)
    expect(sectorFor('left', 4)).toBe(3)
  })
})

describe('navigate', () => {
  it('should enter the sector in the arrow direction when navigating from the center', () => {
    const menu = navigate(createHoldMenu(categories), 'right')

    expect(currentCategory(menu)?.id).toBe('projects')
    expect(menu.touched).toBe(true)
  })

  it('should move to the next category when navigating right from a sector', () => {
    const menu = navigate(navigate(createHoldMenu(categories), 'up'), 'right')

    expect(currentCategory(menu)?.id).toBe('projects')
  })

  it('should wrap to the last category when navigating left from the first one', () => {
    const menu = navigate(navigate(createHoldMenu(categories), 'up'), 'left')

    expect(currentCategory(menu)?.id).toBe('system')
  })

  it('should move the item and wrap when navigating down inside a category', () => {
    let menu = navigate(createHoldMenu(categories), 'right')
    menu = navigate(menu, 'down')
    expect(currentItem(menu)?.id).toBe('frontend')

    menu = navigate(navigate(menu, 'down'), 'down')
    expect(currentItem(menu)?.id).toBe('backend')
  })

  it('should remember the item of each category when going back to it', () => {
    let menu = navigate(createHoldMenu(categories), 'right')
    menu = navigate(navigate(menu, 'down'), 'down')

    menu = navigate(navigate(menu, 'right'), 'left')

    expect(currentItem(menu)?.id).toBe('ops')
  })

  it('should keep the category when navigating down in a category without items', () => {
    const empty = replaceItems(createHoldMenu(categories), 'projects', [])
    const menu = navigate(navigate(empty, 'right'), 'down')

    expect(currentCategory(menu)?.id).toBe('projects')
    expect(currentItem(menu)).toBeUndefined()
  })
})

describe('select', () => {
  it('should jump to the category and item when selecting by pointer', () => {
    const menu = select(createHoldMenu(categories), 1, 2)

    expect(currentItem(menu)?.id).toBe('ops')
    expect(menu.touched).toBe(true)
  })

  it('should ignore an unknown category when selecting', () => {
    const menu = createHoldMenu(categories)

    expect(select(menu, 9)).toBe(menu)
  })
})

describe('replaceItems', () => {
  it('should reset the item to the first one when the items of a category change', () => {
    let menu = navigate(navigate(createHoldMenu(categories), 'right'), 'down')

    menu = replaceItems(menu, 'projects', [{ id: 'x', label: 'x' }])

    expect(currentItem(menu)?.id).toBe('x')
  })

  it('should keep the state when the category does not exist', () => {
    const menu = createHoldMenu(categories)

    expect(replaceItems(menu, 'nope', [])).toBe(menu)
  })
})

describe('release', () => {
  it('should cancel when released without having navigated', () => {
    expect(release(createHoldMenu(categories))).toEqual({ type: 'cancel' })
  })

  it('should cancel when released at the center after a pointer move', () => {
    const menu = { ...createHoldMenu(categories), touched: true }

    expect(release(menu)).toEqual({ type: 'cancel' })
  })

  it('should execute the highlighted item when released after navigating', () => {
    const menu = navigate(createHoldMenu(categories), 'right')

    expect(release(menu)).toEqual({
      type: 'execute',
      categoryId: 'projects',
      item: { id: 'backend', label: 'backend' },
    })
  })

  it('should cancel when the category has no items', () => {
    const empty = replaceItems(createHoldMenu(categories), 'projects', [])

    expect(release(navigate(empty, 'right'))).toEqual({ type: 'cancel' })
  })
})
