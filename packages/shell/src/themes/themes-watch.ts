import { basename, dirname } from 'node:path'
import type { Logger } from '@dck/core'
import { type FolderWatcher, SETTLE_MS } from '../settings/settings-watch.ts'

export interface ThemesWatchDeps {
  readonly folder: string
  watch(folder: string, listener: (event: string, name: string | null) => void): FolderWatcher
  onChange(): void
  readonly scheduler: { after(milliseconds: number, task: () => void): () => void }
  readonly logger: Logger
}

// The themes folder, or its parent until the folder appears (the first theme written, or made by hand)
export function watchThemesFolder(deps: ThemesWatchDeps): () => void {
  const { folder, logger } = deps
  let cancel: (() => void) | undefined
  let inside: FolderWatcher | undefined
  let parent: FolderWatcher | undefined
  const soon = () => {
    cancel?.()
    cancel = deps.scheduler.after(SETTLE_MS, () => {
      cancel = undefined
      deps.onChange()
    })
  }
  const watchInside = (): boolean => {
    try {
      inside = deps.watch(folder, (_event, name) => {
        // A name is not always given; a theme is a .json file, its temporary copy is not
        if (name === null || name.endsWith('.json')) soon()
      })
      return true
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') logger.warn('cannot watch the themes folder', { folder, code })
      return false
    }
  }
  if (!watchInside()) {
    try {
      parent = deps.watch(dirname(folder), (_event, name) => {
        if (name !== basename(folder) || inside) return
        if (watchInside()) soon()
      })
    } catch (error) {
      logger.warn('cannot watch for the themes folder, new themes apply at the next start', {
        folder,
        error: String(error),
      })
    }
  }
  return () => {
    cancel?.()
    inside?.close()
    parent?.close()
  }
}
