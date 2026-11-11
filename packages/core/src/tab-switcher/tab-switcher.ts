export interface SwitcherState {
  readonly order: readonly string[]
  readonly index: number
}

export function openSwitcher(order: readonly string[]): SwitcherState {
  if (order.length === 0) throw new Error('tab switcher needs at least one tab')
  return { order, index: order.length > 1 ? 1 : 0 }
}

export function stepSwitcher(state: SwitcherState, direction: 1 | -1): SwitcherState {
  const size = state.order.length
  return { ...state, index: (state.index + direction + size) % size }
}

export function commitSwitcher(state: SwitcherState): string {
  const id = state.order[state.index]
  if (id === undefined) throw new Error('invariant: switcher index out of range')
  return id
}
