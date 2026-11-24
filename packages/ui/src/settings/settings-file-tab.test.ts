import {
  defaultSettings,
  emptyTabs,
  openTab,
  type SettingsFileLocation,
  type TabsState,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import type { FileAppendix } from '../files/file-tabs.ts'
import { autoSaveOf, createSettingsFileTab } from './settings-file-tab.ts'

const LOCATION: SettingsFileLocation = {
  path: '/home/ana/.config/dck/settings.json',
  folder: '/home/ana/.config/dck',
}

const THEMES = '/home/ana/.config/dck/themes'

// The app around the opener: its tabs, the folder each new one starts in and the file each one shows
function setup(written = true) {
  let state: TabsState = openTab(emptyTabs, { id: 'tab-1', label: 'Tab 1' })
  let counter = 1
  const folders = new Map<string, string>()
  const shown = new Map<string, string>()
  let settingsOpen = true
  const opener = createSettingsFileTab({
    locate: async () => (written ? LOCATION : undefined),
    tabName: () => 'Settings',
    tabs: () => state,
    update: (next) => {
      state = next
    },
    async openTab(cwd) {
      counter += 1
      const id = `tab-${counter}`
      folders.set(id, cwd)
      state = openTab(state, { id, label: `Tab ${counter}` })
      return id
    },
    files: {
      appendix(tabId): FileAppendix | undefined {
        const path = shown.get(tabId)
        return path === undefined
          ? undefined
          : { name: 'settings.json', path, shown: true, mark: undefined }
      },
      async openFile(tabId, path) {
        shown.set(tabId, path)
      },
    },
    closeSettings: () => {
      settingsOpen = false
    },
  })
  return {
    opener,
    state: () => state,
    folders,
    shown,
    settingsOpen: () => settingsOpen,
    activate: (id: string) => {
      state = { ...state, activeId: id }
    },
  }
}

describe('createSettingsFileTab', () => {
  it('should open settings.json in a new tab named Settings at its folder and close the screen when no tab has it', async () => {
    // Arrange
    const { opener, state, folders, shown, settingsOpen } = setup()

    // Act
    const opened = await opener.open()

    // Assert
    expect(opened).toBe(true)
    expect(state().tabs).toEqual([
      { id: 'tab-1', label: 'Tab 1' },
      { id: 'tab-2', label: 'Settings', autoLabel: 'Tab 2' },
    ])
    expect(state().activeId).toBe('tab-2')
    expect(folders.get('tab-2')).toBe('/home/ana/.config/dck')
    expect(shown.get('tab-2')).toBe(LOCATION.path)
    expect(settingsOpen()).toBe(false)
  })

  it('should go to the tab that has settings.json open instead of opening another when it opens again', async () => {
    // Arrange
    const { opener, state, activate } = setup()
    await opener.open()
    activate('tab-1')

    // Act
    await opener.open()

    // Assert
    expect(state().tabs.map((tab) => tab.id)).toEqual(['tab-1', 'tab-2'])
    expect(state().activeId).toBe('tab-2')
  })

  it('should leave the tabs and the screen as they are when the host could not write the file', async () => {
    // Arrange
    const { opener, state, settingsOpen } = setup(false)

    // Act
    const opened = await opener.open()

    // Assert
    expect(opened).toBe(false)
    expect(state().tabs).toHaveLength(1)
    expect(settingsOpen()).toBe(true)
  })
})

describe('createSettingsFileTab openAt', () => {
  it('should open a theme file in a new tab at its folder named as asked when no tab shows it', async () => {
    // Arrange
    const { opener, state, folders, shown } = setup()
    const theme = { path: `${THEMES}/dusk.json`, folder: THEMES }

    // Act
    const opened = await opener.openAt(theme, 'Theme')

    // Assert
    const tab = state().tabs.find((found) => found.id === state().activeId)
    expect(opened).toBe(true)
    expect(tab?.label).toBe('Theme')
    expect(folders.get(tab?.id ?? '')).toBe(THEMES)
    expect(shown.get(tab?.id ?? '')).toBe(theme.path)
  })

  it('should open nothing when there is no theme file to open', async () => {
    // Arrange
    const { opener, state } = setup()

    // Act
    const opened = await opener.openAt(undefined, 'Theme')

    // Assert
    expect(opened).toBe(false)
    expect(state().tabs).toHaveLength(1)
  })
})

describe('autoSaveOf', () => {
  const settingsWith = (autoSave: boolean) => ({
    current: () => ({ ...defaultSettings, files: { ...defaultSettings.files, autoSave } }),
    path: () => LOCATION.path,
  })

  it('should never auto save settings.json and auto save any other file when auto save is on', () => {
    // Arrange
    const autoSave = autoSaveOf(settingsWith(true), () => THEMES)

    // Act
    const decisions = [autoSave(LOCATION.path), autoSave('/home/ana/acme/src/login.ts')]

    // Assert
    expect(decisions).toEqual([false, true])
  })

  it('should never auto save a theme file when auto save is on', () => {
    // Arrange
    const autoSave = autoSaveOf(settingsWith(true), () => THEMES)

    // Act
    const decisions = [autoSave(`${THEMES}/dusk.json`), autoSave(`${THEMES}-old/dusk.json`)]

    // Assert
    expect(decisions).toEqual([false, true])
  })

  it('should auto save no file when auto save is off', () => {
    // Arrange
    const autoSave = autoSaveOf(settingsWith(false), () => THEMES)

    // Act
    const decision = autoSave('/home/ana/acme/src/login.ts')

    // Assert
    expect(decision).toBe(false)
  })
})
