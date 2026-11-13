import { basename, dirname } from 'node:path'
import type { Logger } from '@dck/core'

export interface FolderWatcher {
  close(): void
}

export interface SettingsWatchDeps {
  readonly file: string
  // `fs.watch` on a folder; the file itself is replaced by a rename on every save, which ends a watch on it
  watch(folder: string, listener: (event: string, name: string | null) => void): FolderWatcher
  onChange(): void
  readonly scheduler: { after(milliseconds: number, task: () => void): () => void }
  readonly logger: Logger
}

// One save is a write and a rename, so a burst of events becomes a single reload
const SETTLE_MS = 150

export function watchSettingsFile(deps: SettingsWatchDeps): () => void {
  const name = basename(deps.file)
  let cancel: (() => void) | undefined
  let watcher: FolderWatcher
  try {
    watcher = deps.watch(dirname(deps.file), (_event, changed) => {
      if (changed !== name) return
      cancel?.()
      cancel = deps.scheduler.after(SETTLE_MS, () => {
        cancel = undefined
        deps.onChange()
      })
    })
  } catch (error) {
    deps.logger.warn(
      'cannot watch the settings file, changes from the CLI apply at the next start',
      {
        file: deps.file,
        error: String(error),
      },
    )
    return () => undefined
  }
  return () => {
    cancel?.()
    watcher.close()
  }
}
