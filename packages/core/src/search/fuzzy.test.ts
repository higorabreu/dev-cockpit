import { describe, expect, it } from 'vitest'
import { fuzzyScore, searchItems } from './fuzzy.ts'

describe('fuzzyScore', () => {
  it('should match when the letters appear in order but not together', () => {
    expect(fuzzyScore('spc', 'shop-compose')).toBeDefined()
  })

  it('should not match when a letter is missing or out of order', () => {
    expect(fuzzyScore('xyz', 'shop-compose')).toBeUndefined()
    expect(fuzzyScore('ps', 'shop')).toBeUndefined()
  })

  it('should ignore case and accents when matching', () => {
    expect(fuzzyScore('ação', 'Acao-Service')).toBeDefined()
  })

  it('should rank a substring above scattered letters when scoring', () => {
    const substring = fuzzyScore('comp', 'shop-compose') ?? 0
    const scattered = fuzzyScore('comp', 'cool-mop-p') ?? 0

    expect(substring).toBeGreaterThan(scattered)
  })

  it('should match everything when the query is empty', () => {
    expect(fuzzyScore('  ', 'qualquer')).toBe(0)
  })

  it('should match the parent folder when the text has a path', () => {
    expect(fuzzyScore('id/back', 'id/backend')).toBeDefined()
  })
})

describe('searchItems', () => {
  const names = ['syn/backend', 'id/backend', 'dev-cockpit', 'shop-compose']

  it('should keep the given order when the query is empty', () => {
    expect(searchItems(names, '', (name) => name)).toEqual(names)
  })

  it('should drop items that do not match when searching', () => {
    expect(searchItems(names, 'cockpit', (name) => name)).toEqual(['dev-cockpit'])
  })

  it('should keep the original order when two items tie on score', () => {
    expect(searchItems(['zz/backend', 'aa/backend'], 'backend', (name) => name)).toEqual([
      'zz/backend',
      'aa/backend',
    ])
  })

  it('should put the best match first when searching', () => {
    const result = searchItems(['a-b-c-d', 'abcd'], 'abcd', (name) => name)

    expect(result[0]).toBe('abcd')
  })
})
