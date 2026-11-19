import { activateTab, renameTab, type SettingsFileLocation, type TabsState } from '@dck/core'
import type { FileTabs } from '../files/file-tabs.ts'
import { fileName } from '../files/path-parts.ts'
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
}

// settings.json opens inside the cockpit, in a tab of its own at its folder (D91): the tab that already
// shows it, else a new one named after the file, which the user can rename as any other
export function createSettingsFileTab(deps: SettingsFileTabDeps) {
  return {
    // False when the host could not write the file, so there is nothing to open
    async open(): Promise<boolean> {
      const location = await deps.locate()
      if (!location) return false
      deps.closeSettings()
      const holder = deps
        .tabs()
        .tabs.find((tab) => deps.files.appendix(tab.id)?.path === location.path)
      const id = holder?.id ?? (await deps.openTab(location.folder))
      const named = holder ? deps.tabs() : renameTab(deps.tabs(), id, fileName(location.path))
      deps.update(activateTab(named, id))
      await deps.files.openFile(id, location.path)
      return true
    },
  }
}

// Auto save is decided per file: settings.json waits for Ctrl+S whatever `files.autoSave` says, so a
// half-typed JSON is never applied (D91)
export const autoSaveOf =
  (settings: Pick<SettingsClient, 'current' | 'path'>) =>
  (path: string): boolean =>
    settings.current().files.autoSave && path !== settings.path()
