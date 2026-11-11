export interface MenuItem {
  readonly id: string
  readonly label: string
  readonly shortcut?: string
}

export interface MenuCategory {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly items: readonly MenuItem[]
}

export type Direction = 'left' | 'right' | 'up' | 'down'

export interface HoldMenuState {
  readonly categories: readonly MenuCategory[]
  readonly category: number
  readonly itemByCategory: readonly number[]
  readonly touched: boolean
}

export type ReleaseResult =
  | { readonly type: 'cancel' }
  | { readonly type: 'execute'; readonly categoryId: string; readonly item: MenuItem }

const wrap = (value: number, size: number) => ((value % size) + size) % size

function assertValid(categories: readonly MenuCategory[]) {
  if (categories.length === 0) throw new Error('hold menu needs at least one category')
  if (categories.some((category) => category.items.length === 0)) {
    throw new Error('every hold menu category needs at least one item')
  }
}

export function createHoldMenu(categories: readonly MenuCategory[]): HoldMenuState {
  assertValid(categories)
  return { categories, category: 0, itemByCategory: categories.map(() => 0), touched: false }
}

export function currentCategory(state: HoldMenuState): MenuCategory {
  const category = state.categories[state.category]
  if (!category) throw new Error('invariant: category index out of range')
  return category
}

export function selectedIndex(state: HoldMenuState): number {
  return state.itemByCategory[state.category] ?? 0
}

export function currentItem(state: HoldMenuState): MenuItem {
  const item = currentCategory(state).items[selectedIndex(state)]
  if (!item) throw new Error('invariant: item index out of range')
  return item
}

function withItemIndex(state: HoldMenuState, category: number, index: number): HoldMenuState {
  return {
    ...state,
    itemByCategory: state.itemByCategory.map((current, at) => (at === category ? index : current)),
  }
}

export function navigate(state: HoldMenuState, direction: Direction): HoldMenuState {
  if (direction === 'left' || direction === 'right') {
    const step = direction === 'right' ? 1 : -1
    return {
      ...state,
      touched: true,
      category: wrap(state.category + step, state.categories.length),
    }
  }
  const step = direction === 'down' ? 1 : -1
  const size = currentCategory(state).items.length
  return {
    ...withItemIndex(state, state.category, wrap(selectedIndex(state) + step, size)),
    touched: true,
  }
}

export function select(state: HoldMenuState, category: number, item?: number): HoldMenuState {
  const target = state.categories[category]
  if (!target) return state
  const moved: HoldMenuState = { ...state, category, touched: true }
  if (item === undefined || item < 0 || item >= target.items.length) return moved
  return withItemIndex(moved, category, item)
}

export function replaceItems(
  state: HoldMenuState,
  categoryId: string,
  items: readonly MenuItem[],
): HoldMenuState {
  const categories = state.categories.map((category) =>
    category.id === categoryId ? { ...category, items } : category,
  )
  assertValid(categories)
  const at = categories.findIndex((category) => category.id === categoryId)
  return at === -1 ? state : withItemIndex({ ...state, categories }, at, 0)
}

export function release(state: HoldMenuState): ReleaseResult {
  if (!state.touched) return { type: 'cancel' }
  return { type: 'execute', categoryId: currentCategory(state).id, item: currentItem(state) }
}
