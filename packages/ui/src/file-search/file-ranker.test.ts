import type { FileSearchInput } from '@dck/core'
import { describe, expect, it } from 'vitest'
import {
  createFileRanker,
  createRankHandler,
  type RankAnswer,
  type RankRequest,
  type RankWorker,
} from './file-ranker.ts'

const input: FileSearchInput = {
  files: ['src/app.ts', 'src/main.ts'],
  ignored: ['.env'],
  recent: [],
}

// A worker that keeps the requests and answers only when told, with the real handler
function fakeWorker() {
  const handle = createRankHandler()
  const requests: RankRequest[] = []
  const listeners: { message?: (event: MessageEvent<RankAnswer>) => void; error?: () => void } = {}
  let terminated = false
  const worker: RankWorker = {
    postMessage: (request) => void requests.push(request),
    addEventListener: ((type: 'message' | 'error', listener: never) => {
      listeners[type] = listener
    }) as RankWorker['addEventListener'],
    terminate: () => {
      terminated = true
    },
  }
  const answer = (index: number) => {
    const request = requests[index]
    const reply = request && handle(request)
    if (reply) listeners.message?.({ data: reply } as MessageEvent<RankAnswer>)
  }
  return {
    worker,
    requests,
    answer,
    fail: () => listeners.error?.(),
    terminated: () => terminated,
    load: () => answer(0),
  }
}

describe('createFileRanker', () => {
  it('should answer only the last query when an older answer comes after it', async () => {
    // Arrange
    const fake = fakeWorker()
    const ranker = createFileRanker(() => fake.worker)
    ranker.load(input)
    fake.load()

    // Act
    const first = ranker.groups('app', false)
    const second = ranker.groups('main', false)
    fake.answer(2)
    fake.answer(1)

    // Assert
    expect(await first).toBeUndefined()
    expect((await second)?.project.map((row) => row.path)).toEqual(['src/main.ts'])
  })

  it('should rank in the window when the worker fails', async () => {
    // Arrange
    const fake = fakeWorker()
    const ranker = createFileRanker(() => fake.worker)
    ranker.load(input)
    const pending = ranker.groups('app', false)

    // Act
    fake.fail()

    // Assert
    expect((await pending)?.project.map((row) => row.path)).toEqual(['src/app.ts'])
    expect(fake.terminated()).toBe(true)
  })

  it('should rank in the window when no worker starts', async () => {
    // Arrange
    const ranker = createFileRanker(() => undefined)
    ranker.load(input)

    // Act
    const groups = await ranker.groups('env', false)

    // Assert
    expect(groups?.ignored.map((row) => row.path)).toEqual(['.env'])
  })

  it('should end the worker and leave pending queries unanswered when released', async () => {
    // Arrange
    const fake = fakeWorker()
    const ranker = createFileRanker(() => fake.worker)
    ranker.load(input)
    const pending = ranker.groups('app', false)

    // Act
    ranker.release()

    // Assert
    expect(await pending).toBeUndefined()
    expect(fake.terminated()).toBe(true)
  })
})
