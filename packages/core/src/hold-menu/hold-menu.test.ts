import { describe, expect, it } from 'vitest'
import {
  createHoldMenu,
  currentItem,
  type MenuCategory,
  navigate,
  release,
  replaceItems,
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
  { id: 'system', label: 'Sistema', icon: 'sliders', items: [{ id: 'theme', label: 'Tema' }] },
]

describe('createHoldMenu', () => {
  it('should start on the first item of the first category when the menu is created', () => {
    const menu = createHoldMenu(categories)

    expect(currentItem(menu).id).toBe('new-tab')
    expect(menu.touched).toBe(false)
  })

  it('should reject the menu when a category has no items', () => {
    const empty: MenuCategory = { id: 'empty', label: 'Vazio', icon: 'x', items: [] }

    expect(() => createHoldMenu([empty])).toThrow()
  })

  it('should reject the menu when there are no categories', () => {
    expect(() => createHoldMenu([])).toThrow()
  })
})

describe('navigate', () => {
  it('should move to the next category when the user presses right', () => {
    const menu = createHoldMenu(categories)

    const result = navigate(menu, 'right')

    expect(result.category).toBe(1)
    expect(currentItem(result).id).toBe('backend')
  })

  it('should wrap to the last category when the user presses left on the first one', () => {
    const menu = createHoldMenu(categories)

    const result = navigate(menu, 'left')

    expect(result.category).toBe(2)
  })

  it('should move to the next item when the user presses down', () => {
    const menu = navigate(createHoldMenu(categories), 'right')

    const result = navigate(menu, 'down')

    expect(currentItem(result).id).toBe('frontend')
  })

  it('should wrap to the last item when the user presses up on the first item', () => {
    const menu = navigate(createHoldMenu(categories), 'right')

    const result = navigate(menu, 'up')

    expect(currentItem(result).id).toBe('ops')
  })

  it('should remember the item of each category when the user comes back to it', () => {
    const onProjects = navigate(navigate(createHoldMenu(categories), 'right'), 'down')

    const back = navigate(navigate(navigate(onProjects, 'right'), 'right'), 'right')

    expect(currentItem(back).id).toBe('frontend')
  })

  it('should mark the menu as touched when the user navigates', () => {
    const menu = createHoldMenu(categories)

    const result = navigate(menu, 'down')

    expect(result.touched).toBe(true)
  })

  it('should not mutate the previous state when navigating', () => {
    const menu = createHoldMenu(categories)

    navigate(menu, 'right')

    expect(menu.category).toBe(0)
    expect(menu.touched).toBe(false)
  })
})

describe('select', () => {
  it('should select the category and item when the pointer hovers them', () => {
    const menu = createHoldMenu(categories)

    const result = select(menu, 1, 2)

    expect(currentItem(result).id).toBe('ops')
    expect(result.touched).toBe(true)
  })

  it('should keep the state when the hovered category does not exist', () => {
    const menu = createHoldMenu(categories)

    const result = select(menu, 9)

    expect(result).toBe(menu)
  })
})

describe('release', () => {
  it('should cancel when the user releases without having navigated', () => {
    const menu = createHoldMenu(categories)

    const result = release(menu)

    expect(result).toEqual({ type: 'cancel' })
  })

  it('should execute the highlighted item when the user releases after navigating', () => {
    const menu = navigate(navigate(createHoldMenu(categories), 'right'), 'down')

    const result = release(menu)

    expect(result).toEqual({
      type: 'execute',
      categoryId: 'projects',
      item: { id: 'frontend', label: 'frontend' },
    })
  })
})

describe('replaceItems', () => {
  it('should highlight the first item when the items of a category are replaced', () => {
    const onOps = select(createHoldMenu(categories), 1, 2)
    const recent = [
      { id: 'ops', label: 'ops' },
      { id: 'backend', label: 'backend' },
    ]

    const result = replaceItems(onOps, 'projects', recent)

    expect(currentItem(result).id).toBe('ops')
  })

  it('should reject the replacement when the new list is empty', () => {
    const menu = createHoldMenu(categories)

    expect(() => replaceItems(menu, 'projects', [])).toThrow()
  })
})
