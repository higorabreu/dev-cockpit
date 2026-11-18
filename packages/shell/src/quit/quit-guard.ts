import type { SessionActivityInfo } from '@dck/core'

export interface QuitGuardDeps {
  // The shell of each open terminal
  pids(): readonly number[]
  // A fresh read of what runs in the foreground; the window's watcher lags up to one cycle
  activity(pid: number): Promise<SessionActivityInfo | undefined>
  // Shows the window and asks it to confirm, with how many tabs run a program
  ask(running: number): void
  quit(): void
}

export type QuitGuard = ReturnType<typeof createQuitGuard>

// A quit asks first while a tab runs a program other than its shell; with only idle shells it quits at once
export function createQuitGuard(deps: QuitGuardDeps) {
  let state: 'idle' | 'counting' | 'asking' = 'idle'

  async function running(): Promise<number> {
    const found = await Promise.all(
      // A terminal that cannot be read is not counted: it holds no program the user could lose
      deps.pids().map((pid) => deps.activity(pid).catch(() => undefined)),
    )
    return found.filter((info) => info !== undefined && info.activity !== 'idle').length
  }

  return {
    async request() {
      // Asked again while the window asks, as with ⌘Q pressed twice: the user means it
      if (state === 'asking') {
        state = 'idle'
        deps.quit()
        return
      }
      if (state === 'counting') return
      state = 'counting'
      const count = await running()
      if (count === 0) {
        state = 'idle'
        deps.quit()
        return
      }
      state = 'asking'
      deps.ask(count)
    },
    // Only the answer to a question asked counts; anything else from the window is ignored
    answer(quit: boolean) {
      if (state !== 'asking') return
      state = 'idle'
      if (quit) deps.quit()
    },
  }
}
