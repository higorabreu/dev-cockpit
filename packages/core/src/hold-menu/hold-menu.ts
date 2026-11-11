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

export const CENTER = -1

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

const VECTORS: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
}

// Os setores ficam em círculo a partir do topo, no sentido horário
export function sectorAngle(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count
}

// Do centro, a seta escolhe o setor que está naquela direção
export function sectorFor(direction: Direction, count: number): number {
  const [dx, dy] = VECTORS[direction]
  let best = 0
  let bestScore = Number.NEGATIVE_INFINITY
  for (let index = 0; index < count; index++) {
    const angle = sectorAngle(index, count)
    const score = Math.cos(angle) * dx + Math.sin(angle) * dy
    if (score > bestScore + 1e-9) {
      best = index
      bestScore = score
    }
  }
  return best
}

export function createHoldMenu(categories: readonly MenuCategory[]): HoldMenuState {
  if (categories.length === 0) throw new Error('hold menu needs at least one category')
  return { categories, category: CENTER, itemByCategory: categories.map(() => 0), touched: false }
}

export function currentCategory(state: HoldMenuState): MenuCategory | undefined {
  return state.categories[state.category]
}

export function selectedIndex(state: HoldMenuState): number {
  return state.itemByCategory[state.category] ?? 0
}

export function currentItem(state: HoldMenuState): MenuItem | undefined {
  return currentCategory(state)?.items[selectedIndex(state)]
}

function withItemIndex(state: HoldMenuState, category: number, index: number): HoldMenuState {
  return {
    ...state,
    itemByCategory: state.itemByCategory.map((current, at) => (at === category ? index : current)),
  }
}

export function navigate(state: HoldMenuState, direction: Direction): HoldMenuState {
  const count = state.categories.length
  if (state.category === CENTER) {
    return { ...state, touched: true, category: sectorFor(direction, count) }
  }
  if (direction === 'left' || direction === 'right') {
    const step = direction === 'right' ? 1 : -1
    return { ...state, touched: true, category: wrap(state.category + step, count) }
  }
  const size = currentCategory(state)?.items.length ?? 0
  if (size === 0) return { ...state, touched: true }
  const step = direction === 'down' ? 1 : -1
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
  const at = state.categories.findIndex((category) => category.id === categoryId)
  if (at === -1) return state
  const categories = state.categories.map((category, index) =>
    index === at ? { ...category, items } : category,
  )
  return withItemIndex({ ...state, categories }, at, 0)
}

export function release(state: HoldMenuState): ReleaseResult {
  const category = currentCategory(state)
  const item = currentItem(state)
  if (!state.touched || !category || !item) return { type: 'cancel' }
  return { type: 'execute', categoryId: category.id, item }
}
