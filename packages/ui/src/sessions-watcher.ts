import type { SessionActivityInfo } from '@dck/core'

export interface WatchedTab {
  readonly id: string
  readonly ptyId: number
}

export interface WatcherOptions {
  tabs(): readonly WatchedTab[]
  activity(ptyId: number): Promise<SessionActivityInfo | undefined>
  onChange(): void
  readonly intervalMs?: number
}

const DEFAULT_INTERVAL_MS = 2000

// Vigia a atividade de todas as abas, mesmo com a janela escondida: é leitura leve, sem git
export function createSessionWatcher(options: WatcherOptions) {
  const known = new Map<string, SessionActivityInfo>()
  let running = false

  async function poll() {
    if (running) return
    running = true
    try {
      const tabs = options.tabs()
      const results = await Promise.all(tabs.map((tab) => options.activity(tab.ptyId)))
      let changed = known.size !== tabs.length
      const seen = new Set<string>()
      tabs.forEach((tab, index) => {
        seen.add(tab.id)
        const next = results[index]
        const before = known.get(tab.id)
        if (!next) return
        if (JSON.stringify(before) !== JSON.stringify(next)) changed = true
        known.set(tab.id, next)
      })
      for (const id of known.keys()) {
        if (!seen.has(id)) {
          known.delete(id)
          changed = true
        }
      }
      if (changed) options.onChange()
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void poll(), options.intervalMs ?? DEFAULT_INTERVAL_MS)

  return {
    get: (tabId: string) => known.get(tabId),
    poll,
    stop: () => clearInterval(timer),
  }
}
