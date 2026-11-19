import { createFileSearch, type FileGroups, type FileSearch, type FileSearchInput } from '@dck/core'

// What the window asks the ranking worker, and its answer
export type RankRequest =
  | { readonly kind: 'load'; readonly input: FileSearchInput }
  | {
      readonly kind: 'groups'
      readonly seq: number
      readonly query: string
      readonly widened: boolean
    }

export interface RankAnswer {
  readonly seq: number
  readonly groups: FileGroups
}

// The worker's side, kept here so the window can run it itself when no worker starts
export function createRankHandler() {
  let search: FileSearch | undefined
  return (request: RankRequest): RankAnswer | undefined => {
    if (request.kind === 'load') {
      search = createFileSearch(request.input)
      return undefined
    }
    if (!search) return undefined
    return { seq: request.seq, groups: search.groups(request.query, request.widened) }
  }
}

// The part of a Worker the ranker uses, so a test can give a fake
export interface RankWorker {
  postMessage(request: RankRequest): void
  addEventListener(type: 'message', listener: (event: MessageEvent<RankAnswer>) => void): void
  addEventListener(type: 'error', listener: () => void): void
  terminate(): void
}

export interface FileRanker {
  load(input: FileSearchInput): void
  // Undefined when a newer query came first: only the last answer is drawn
  groups(query: string, widened: boolean): Promise<FileGroups | undefined>
  // The search closed: the list goes with the worker
  release(): void
}

// A module worker built beside the page; undefined where workers cannot start
export function startRankWorker(): RankWorker | undefined {
  try {
    return new Worker(new URL('./file-rank-worker.ts', import.meta.url), { type: 'module' })
  } catch {
    // The ranker then ranks in the window, as fast but on the same thread as the keys
    return undefined
  }
}

// Ranking a large repository takes longer than a frame, so it runs in a worker started for each search;
// without one (a test, a worker that fails) it runs here
export function createFileRanker(startWorker: () => RankWorker | undefined): FileRanker {
  let worker: RankWorker | undefined
  let local: ReturnType<typeof createRankHandler> | undefined
  let loaded: FileSearchInput | undefined
  let seq = 0
  type Resolve = (groups: FileGroups | undefined) => void
  const waiting = new Map<number, { readonly request: RankRequest; readonly resolve: Resolve }>()

  // Every query before the answered one is stale
  function settle(answer: RankAnswer) {
    for (const [id, { resolve }] of waiting) {
      if (id > answer.seq) continue
      waiting.delete(id)
      resolve(id === answer.seq ? answer.groups : undefined)
    }
  }

  function fallBack() {
    worker?.terminate()
    worker = undefined
    local = createRankHandler()
    if (loaded) local({ kind: 'load', input: loaded })
    // The queries the worker never answered are asked again here, the last one alone
    const last = Math.max(-1, ...waiting.keys())
    for (const [id, { request, resolve }] of waiting)
      resolve(id === last ? local(request)?.groups : undefined)
    waiting.clear()
  }

  return {
    load(input) {
      loaded = input
      if (worker) return worker.postMessage({ kind: 'load', input })
      if (local) return void local({ kind: 'load', input })
      worker = startWorker()
      if (worker) {
        worker.addEventListener('message', (event) => settle(event.data))
        worker.addEventListener('error', fallBack)
        worker.postMessage({ kind: 'load', input })
      } else {
        local = createRankHandler()
        local({ kind: 'load', input })
      }
    },
    groups(query, widened) {
      seq += 1
      const request: RankRequest = { kind: 'groups', seq, query, widened }
      if (!worker) {
        const answer = local?.(request)
        return Promise.resolve(answer?.groups)
      }
      return new Promise((resolve) => {
        waiting.set(request.seq, { request, resolve })
        worker?.postMessage(request)
      })
    },
    release() {
      worker?.terminate()
      worker = undefined
      local = undefined
      loaded = undefined
      for (const { resolve } of waiting.values()) resolve(undefined)
      waiting.clear()
    },
  }
}
