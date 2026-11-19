// The window's answer once it settled its open files: quit, stay (the user cancelled, or a file needs a
// decision), or asking (the user is being asked; the window shows and the wait has no limit)
export type FilesAnswer = 'quit' | 'stay' | 'asking'

export interface QuitFilesDeps {
  // Asks the window to write its pending saves and to say whether the app may quit
  settle(): void
  // Shows the window, which asks the user about a file
  present(): void
  quit(): void
  after(milliseconds: number, task: () => void): () => void
}

// The window writes its pending saves within 2 s; one that has not answered a moment later, a window
// that hangs, does not keep the app from quitting
export const SETTLE_MS = 2500

export type QuitFiles = ReturnType<typeof createQuitFiles>

// Every quit passes here last (⌘Q, the menus, the quit card's Quit): the open files are saved first, and a
// file that needs the user keeps the app open until they decide
export function createQuitFiles(deps: QuitFilesDeps) {
  let state: 'idle' | 'waiting' | 'asking' = 'idle'
  let cancel: (() => void) | undefined

  const finish = () => {
    cancel?.()
    cancel = undefined
    state = 'idle'
  }

  return {
    request() {
      if (state !== 'idle') return
      state = 'waiting'
      deps.settle()
      cancel = deps.after(SETTLE_MS, () => {
        if (state !== 'waiting') return
        finish()
        deps.quit()
      })
    },
    // Only an answer to a request counts
    answer(answer: FilesAnswer) {
      if (state === 'idle') return
      if (answer === 'asking') {
        cancel?.()
        cancel = undefined
        state = 'asking'
        deps.present()
        return
      }
      finish()
      if (answer === 'quit') deps.quit()
    },
  }
}
