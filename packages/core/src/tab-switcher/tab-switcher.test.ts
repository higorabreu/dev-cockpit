import { describe, expect, it } from 'vitest'
import { commitSwitcher, openSwitcher, stepSwitcher } from './tab-switcher.ts'

describe('openSwitcher', () => {
  it('should highlight the previous tab when the switcher opens', () => {
    const state = openSwitcher(['current', 'previous', 'older'])

    expect(commitSwitcher(state)).toBe('previous')
  })

  it('should highlight the only tab when there is a single one', () => {
    const state = openSwitcher(['only'])

    expect(commitSwitcher(state)).toBe('only')
  })

  it('should reject opening when there are no tabs', () => {
    expect(() => openSwitcher([])).toThrow()
  })
})

describe('stepSwitcher', () => {
  it('should highlight the next tab when stepping forward', () => {
    const state = openSwitcher(['current', 'previous', 'older'])

    const result = stepSwitcher(state, 1)

    expect(commitSwitcher(result)).toBe('older')
  })

  it('should wrap to the first tab when stepping forward from the last one', () => {
    const state = stepSwitcher(openSwitcher(['current', 'previous', 'older']), 1)

    const result = stepSwitcher(state, 1)

    expect(commitSwitcher(result)).toBe('current')
  })

  it('should wrap to the last tab when stepping back from the first one', () => {
    const state = stepSwitcher(openSwitcher(['current', 'previous', 'older']), -1)

    const result = stepSwitcher(state, -1)

    expect(commitSwitcher(result)).toBe('older')
  })
})
