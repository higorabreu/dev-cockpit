import { activateTab, renameTab, type SettingsFileLocation, type TabsState } from '@dck/core'
import type { FileTabs } from '../files/file-tabs.ts'
import type { SettingsClient } from './settings-client.ts'

export interface SettingsFileTabDeps {
  // Writes the file when there is none and says where it is; undefined when the host could not
  locate(): Promise<SettingsFileLocation | undefined>
  tabs(): TabsState
  update(next: TabsState): void
  // A new tab whose terminal starts in the folder, as a folder or a project opens one; its id
  openTab(cwd: string): Promise<string>
  readonly files: Pick<FileTabs, 'appendix' | 'openFile'>
  closeSettings(): void
  // The new tab's name, the Settings screen's title in the interface's language
  tabName(): string
}

// settings.json opens inside the cockpit, in a tab of its own at its folder (D91): the tab that already
// shows it, else a new one named Settings, which the user can rename as any other. A theme file opens the
// same way, named Theme
export function createSettingsFileTab(deps: SettingsFileTabDeps) {
  // False when there is no file to open
  async function openAt(
    location: SettingsFileLocation | undefined,
    name: string,
  ): Promise<boolean> {
    if (!location) return false
    deps.closeSettings()
    const holder = deps
      .tabs()
      .tabs.find((tab) => deps.files.appendix(tab.id)?.path === location.path)
    const id = holder?.id ?? (await deps.openTab(location.folder))
    const named = holder ? deps.tabs() : renameTab(deps.tabs(), id, name)
    deps.update(activateTab(named, id))
    await deps.files.openFile(id, location.path)
    return true
  }
  return {
    // False when the host could not write the file, so there is nothing to open
    open: async (): Promise<boolean> => openAt(await deps.locate(), deps.tabName()),
    openAt,
  }
}

const inside = (folder: string, path: string) =>
  path.startsWith(`${folder}/`) || path.startsWith(`${folder}\\`)

// Auto save is decided per file: settings.json and the theme files wait for Ctrl+S whatever `files.autoSave`
// says, so a half-typed JSON is never applied (D91)
export const autoSaveOf =
  (settings: Pick<SettingsClient, 'current' | 'path'>, themesFolder: () => string) =>
  (path: string): boolean =>
    settings.current().files.autoSave && path !== settings.path() && !inside(themesFolder(), path)
