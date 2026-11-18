import { describe, expect, it } from 'vitest'
import { sameSavedTabs, tabsToSave } from './saved-tabs.ts'
import { activateTab, emptyTabs, openTab, renameTab } from './tabs.ts'

const state = () => {
  let tabs = openTab(emptyTabs, { id: 'a', label: 'shell 1' })
  tabs = openTab(tabs, { id: 'b', label: 'acme-api' })
  tabs = openTab(tabs, { id: 'c', label: 'shell 3' })
  return activateTab(renameTab(tabs, 'c', 'deploys'), 'b')
}

const facts = (id: string) =>
  ({
    a: { cwd: '/home/ana', named: false },
    b: { cwd: '/home/ana/acme/api/src', project: '/home/ana/acme/api', named: true },
    c: { cwd: '/home/ana/ops', named: false },
  })[id] ?? { named: false }

describe('tabsToSave', () => {
  it('should keep each tab in order with its folder, its project name and the name the user gave it', () => {
    // Act
    const saved = tabsToSave(state(), facts)

    // Assert
    expect(saved.tabs).toEqual([
      { cwd: '/home/ana' },
      { cwd: '/home/ana/acme/api/src', label: 'acme-api', project: '/home/ana/acme/api' },
      { cwd: '/home/ana/ops', name: 'deploys' },
    ])
  })

  it('should keep which tab was active', () => {
    expect(tabsToSave(state(), facts).active).toBe(1)
  })

  it('should keep the name a project tab opened with under the name the user gave it', () => {
    const renamed = renameTab(state(), 'b', 'api')

    expect(tabsToSave(renamed, facts).tabs[1]).toEqual({
      cwd: '/home/ana/acme/api/src',
      label: 'acme-api',
      project: '/home/ana/acme/api',
      name: 'api',
    })
  })

  it('should leave the folder out when the watcher has not read the tab yet', () => {
    const saved = tabsToSave(openTab(emptyTabs, { id: 'x', label: 'shell 1' }), () => ({
      named: false,
    }))

    expect(saved).toEqual({ tabs: [{}], active: 0 })
  })
})

describe('sameSavedTabs', () => {
  it('should tell an unchanged set of tabs from a changed one', () => {
    const saved = tabsToSave(state(), facts)

    expect(sameSavedTabs(saved, tabsToSave(state(), facts))).toBe(true)
    expect(sameSavedTabs(saved, { ...saved, active: 0 })).toBe(false)
    expect(sameSavedTabs(undefined, saved)).toBe(false)
  })
})
