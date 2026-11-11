import { describe, expect, it } from 'vitest'
import {
  activateTab,
  activateTabAt,
  closeOtherTabs,
  closeTab,
  emptyTabs,
  openTab,
  recentTabs,
  reorderTabs,
  stepTab,
} from './tabs.ts'

const tab = (id: string) => ({ id, label: id })

function withTabs(...ids: string[]) {
  return ids.reduce((state, id) => openTab(state, tab(id)), emptyTabs)
}

const ids = (state: ReturnType<typeof withTabs>) => state.tabs.map((entry) => entry.id)

describe('openTab', () => {
  it('should add the tab at the end and activate it when opening a new tab', () => {
    const state = withTabs('a', 'b')

    expect(ids(state)).toEqual(['a', 'b'])
    expect(state.activeId).toBe('b')
  })

  it('should keep the state when a tab with the same id is already open', () => {
    const state = withTabs('a')

    expect(openTab(state, tab('a'))).toBe(state)
  })
})

describe('closeTab', () => {
  it('should activate the most recently used remaining tab when the active tab is closed', () => {
    const state = activateTab(activateTab(withTabs('a', 'b', 'c'), 'a'), 'c')

    const result = closeTab(state, 'c')

    expect(result.activeId).toBe('a')
    expect(ids(result)).toEqual(['a', 'b'])
  })

  it('should keep the active tab when another tab is closed', () => {
    const state = withTabs('a', 'b', 'c')

    const result = closeTab(state, 'a')

    expect(result.activeId).toBe('c')
  })

  it('should keep the last tab when closing it', () => {
    const state = withTabs('a')

    expect(closeTab(state, 'a')).toBe(state)
  })

  it('should keep the state when the tab does not exist', () => {
    const state = withTabs('a', 'b')

    expect(closeTab(state, 'x')).toBe(state)
  })
})

describe('closeOtherTabs', () => {
  it('should keep only the chosen tab and activate it when closing the others', () => {
    const state = withTabs('a', 'b', 'c')

    const result = closeOtherTabs(state, 'b')

    expect(ids(result)).toEqual(['b'])
    expect(result.activeId).toBe('b')
  })
})

describe('stepTab', () => {
  it('should move to the next tab in bar order when stepping forward', () => {
    const state = activateTab(withTabs('a', 'b', 'c'), 'a')

    expect(stepTab(state, 1).activeId).toBe('b')
  })

  it('should wrap to the first tab when stepping forward from the last one', () => {
    const state = withTabs('a', 'b', 'c')

    expect(stepTab(state, 1).activeId).toBe('a')
  })

  it('should wrap to the last tab when stepping back from the first one', () => {
    const state = activateTab(withTabs('a', 'b', 'c'), 'a')

    expect(stepTab(state, -1).activeId).toBe('c')
  })

  it('should follow the bar order and not the usage order when stepping', () => {
    const state = activateTab(activateTab(activateTab(withTabs('a', 'b', 'c'), 'a'), 'c'), 'a')

    expect(stepTab(state, 1).activeId).toBe('b')
  })
})

describe('activateTabAt', () => {
  it('should activate the tab at the position when the position exists', () => {
    expect(activateTabAt(withTabs('a', 'b', 'c'), 1).activeId).toBe('b')
  })

  it('should keep the state when there is no tab at the position', () => {
    const state = withTabs('a')

    expect(activateTabAt(state, 5)).toBe(state)
  })
})

describe('reorderTabs', () => {
  it('should follow the new order when the ids are a permutation of the tabs', () => {
    const state = withTabs('a', 'b', 'c')

    expect(ids(reorderTabs(state, ['c', 'a', 'b']))).toEqual(['c', 'a', 'b'])
  })

  it('should ignore the new order when it loses or invents a tab', () => {
    const state = withTabs('a', 'b')

    expect(reorderTabs(state, ['a'])).toBe(state)
    expect(reorderTabs(state, ['a', 'x'])).toBe(state)
  })

  it('should keep the active tab when reordering', () => {
    const state = withTabs('a', 'b', 'c')

    expect(reorderTabs(state, ['c', 'b', 'a']).activeId).toBe('c')
  })
})

describe('recentTabs', () => {
  it('should list the most recently used tab first when listing recent tabs', () => {
    const state = activateTab(activateTab(withTabs('a', 'b', 'c'), 'a'), 'b')

    expect(recentTabs(state).map((entry) => entry.id)).toEqual(['b', 'a', 'c'])
  })

  it('should put tabs that were never used at the end when listing recent tabs', () => {
    const state = closeOtherTabs(withTabs('a', 'b', 'c'), 'b')

    expect(recentTabs(state).map((entry) => entry.id)).toEqual(['b'])
  })
})
