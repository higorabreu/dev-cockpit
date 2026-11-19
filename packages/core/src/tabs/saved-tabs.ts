import type { TabsState } from './tabs.ts'

// A tab as it is kept between runs: where its terminal was, the name it opened with when that was not the
// counter's (a project's), the project it belongs to, and the name the user gave it
export interface SavedTab {
  readonly cwd?: string
  readonly label?: string
  readonly project?: string
  readonly name?: string
  // The file open over the tab (paths only, never what it holds), opened again on start if it still exists
  readonly file?: string
}

export interface SavedTabs {
  readonly tabs: readonly SavedTab[]
  // Index of the active tab
  readonly active: number
}

// What the window knows of a tab beyond its name
export interface TabFacts {
  readonly cwd?: string
  readonly project?: string
  readonly file?: string
  // It opened with a name of its own (a project's), not the counter's, which the next run gives again
  readonly named: boolean
}

export function tabsToSave(state: TabsState, facts: (id: string) => TabFacts): SavedTabs {
  const tabs = state.tabs.map((tab): SavedTab => {
    const { cwd, project, file, named } = facts(tab.id)
    const automatic = tab.autoLabel ?? tab.label
    return {
      ...(cwd ? { cwd } : {}),
      ...(named ? { label: automatic } : {}),
      ...(project ? { project } : {}),
      ...(tab.autoLabel === undefined ? {} : { name: tab.label }),
      ...(file ? { file } : {}),
    }
  })
  return {
    tabs,
    active: Math.max(
      0,
      state.tabs.findIndex((tab) => tab.id === state.activeId),
    ),
  }
}

export const sameSavedTabs = (a: SavedTabs | undefined, b: SavedTabs): boolean =>
  a !== undefined && JSON.stringify(a) === JSON.stringify(b)
