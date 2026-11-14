import type { HostApi } from '@dck/core'
import type { SettingsClient } from '../settings/settings-client.ts'

export interface RootChooserDeps {
  readonly pick: HostApi['projects']['chooseRoot']
  readonly settings: Pick<SettingsClient, 'current' | 'update'>
}

// The projects folder is the user's choice: the system picker asks and the settings model keeps it
export function createRootChooser({ pick, settings }: RootChooserDeps) {
  return {
    needed: () => settings.current().projects.root === null,
    // True once a folder is saved; a cancelled picker leaves the setting as it was
    async choose(): Promise<boolean> {
      const root = await pick()
      if (root === undefined) return false
      const result = await settings.update({ projects: { root } })
      return result.settings.projects.root !== null
    },
  }
}
