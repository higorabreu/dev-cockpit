import { createRankHandler, type RankAnswer, type RankRequest } from './file-ranker.ts'

// The worker's own scope; the window's types do not describe it
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<RankRequest>) => void): void
  postMessage(answer: RankAnswer): void
}

const handle = createRankHandler()
let latest: RankRequest | undefined
let scheduled = false

// Keys typed faster than a ranking are answered once, for the last query
function rankLatest() {
  scheduled = false
  const request = latest
  latest = undefined
  const answer = request && handle(request)
  if (answer) scope.postMessage(answer)
}

scope.addEventListener('message', (event) => {
  if (event.data.kind === 'load') {
    handle(event.data)
    return
  }
  latest = event.data
  if (scheduled) return
  scheduled = true
  setTimeout(rankLatest, 0)
})
