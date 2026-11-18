import type { SessionActivity, SessionActivityInfo } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createQuitGuard } from './quit-guard.ts'

const info = (activity: SessionActivity): SessionActivityInfo => ({
  cwd: '/home/ana/acme',
  process: activity === 'idle' ? 'zsh' : 'node',
  activity,
})

// Each pid's foreground; a pid missing from the table cannot be read, as a vanished process
function setup(foreground: Record<number, SessionActivity | 'fails'>) {
  const calls: string[] = []
  const guard = createQuitGuard({
    pids: () => Object.keys(foreground).map(Number),
    activity: async (pid) => {
      const found = foreground[pid]
      if (found === 'fails') throw new Error('ps timed out')
      return found ? info(found) : undefined
    },
    ask: (running) => void calls.push(`ask ${running}`),
    quit: () => void calls.push('quit'),
  })
  return { guard, calls }
}

describe('createQuitGuard', () => {
  it('should quit at once when every terminal sits at its shell', async () => {
    const { guard, calls } = setup({ 4100: 'idle', 4200: 'idle' })

    await guard.request()

    expect(calls).toEqual(['quit'])
  })

  it('should quit at once when no terminal is open', async () => {
    const { guard, calls } = setup({})

    await guard.request()

    expect(calls).toEqual(['quit'])
  })

  it('should ask with how many tabs run a program when an agent or a command runs', async () => {
    const { guard, calls } = setup({ 4100: 'agent', 4200: 'idle', 4300: 'busy' })

    await guard.request()

    expect(calls).toEqual(['ask 2'])
  })

  it('should leave out a terminal it cannot read when counting the programs', async () => {
    const { guard, calls } = setup({ 4100: 'busy', 4200: 'fails' })

    await guard.request()

    expect(calls).toEqual(['ask 1'])
  })

  it('should quit when the window answers yes to the question', async () => {
    // Arrange
    const { guard, calls } = setup({ 4100: 'busy' })
    await guard.request()

    // Act
    guard.answer(true)

    // Assert
    expect(calls).toEqual(['ask 1', 'quit'])
  })

  it('should stay open and ask again on the next request when the window cancels', async () => {
    // Arrange
    const { guard, calls } = setup({ 4100: 'busy' })
    await guard.request()

    // Act
    guard.answer(false)
    await guard.request()

    // Assert
    expect(calls).toEqual(['ask 1', 'ask 1'])
  })

  it('should quit when asked again while the window asks', async () => {
    // Arrange
    const { guard, calls } = setup({ 4100: 'agent' })
    await guard.request()

    // Act
    await guard.request()

    // Assert
    expect(calls).toEqual(['ask 1', 'quit'])
  })

  it('should count once when a second request comes while the first is still counting', async () => {
    // Arrange
    const { guard, calls } = setup({ 4100: 'busy' })

    // Act
    await Promise.all([guard.request(), guard.request()])

    // Assert
    expect(calls).toEqual(['ask 1'])
  })

  it('should ignore an answer when nothing was asked', () => {
    const { guard, calls } = setup({ 4100: 'busy' })

    guard.answer(true)

    expect(calls).toEqual([])
  })
})
