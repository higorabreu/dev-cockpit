import { describe, expect, it } from 'vitest'
import { orderByRecency, recordInteraction } from './recency.ts'

describe('recordInteraction', () => {
  it('should move the project to the front when it already has a recent interaction', () => {
    const recent = ['backend', 'frontend', 'ops']

    const result = recordInteraction(recent, 'ops')

    expect(result).toEqual(['ops', 'backend', 'frontend'])
  })

  it('should add the project at the front when it has no recent interaction', () => {
    const recent = ['backend']

    const result = recordInteraction(recent, 'frontend')

    expect(result).toEqual(['frontend', 'backend'])
  })

  it('should drop the oldest entries when the history exceeds the maximum', () => {
    const recent = ['a', 'b', 'c']

    const result = recordInteraction(recent, 'd', 3)

    expect(result).toEqual(['d', 'a', 'b'])
  })

  it('should not mutate the given history when recording an interaction', () => {
    const recent = ['a', 'b']

    recordInteraction(recent, 'b')

    expect(recent).toEqual(['a', 'b'])
  })
})

describe('orderByRecency', () => {
  it('should put recent projects first and keep the rest in their order when some are recent', () => {
    const known = ['alpha', 'backend', 'frontend', 'zeta']
    const recent = ['frontend', 'alpha']

    const result = orderByRecency(known, recent)

    expect(result).toEqual(['frontend', 'alpha', 'backend', 'zeta'])
  })

  it('should ignore recent entries that are no longer known when ordering', () => {
    const known = ['backend', 'frontend']
    const recent = ['removed', 'frontend']

    const result = orderByRecency(known, recent)

    expect(result).toEqual(['frontend', 'backend'])
  })

  it('should keep the known order when there is no recent interaction', () => {
    const known = ['b', 'a']

    const result = orderByRecency(known, [])

    expect(result).toEqual(['b', 'a'])
  })

  it('should list a project once when the history repeats it', () => {
    const known = ['a', 'b']
    const recent = ['b', 'b', 'a']

    const result = orderByRecency(known, recent)

    expect(result).toEqual(['b', 'a'])
  })
})
