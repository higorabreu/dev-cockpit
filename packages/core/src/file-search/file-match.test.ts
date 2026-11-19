import { describe, expect, it } from 'vitest'
import {
  createFileMatcher,
  folderOf,
  nameOf,
  prepareQuery,
  scorePath,
  strictNameScore,
} from './file-match.ts'

const score = (query: string, path: string) => scorePath(prepareQuery(query), path)

const ranked = (paths: readonly string[], query: string, limit = 10) => {
  const matcher = createFileMatcher(paths)
  return matcher.rank(query, limit).indices.map((index) => paths[index])
}

describe('scorePath', () => {
  it('should match when the letters appear in order across folders', () => {
    expect(score('uapp', 'packages/ui/src/app.ts')).toBeDefined()
  })

  it('should not match when a letter is missing or out of order', () => {
    expect(score('xyz', 'packages/ui/src/app.ts')).toBeUndefined()
    expect(score('ppa', 'src/app')).toBeUndefined()
  })

  it('should rank a name that starts with the query above one that only contains it when both match', () => {
    expect(score('main', 'src/main.ts')).toBeGreaterThan(score('main', 'src/domain.ts') ?? 0)
  })

  it('should rank word starts above letters in the middle of words when scoring', () => {
    expect(score('fs', 'src/file-search.ts')).toBeGreaterThan(score('fs', 'src/offset.ts') ?? 0)
  })

  it('should take camelCase capitals as word starts when scoring', () => {
    expect(score('fs', 'src/FileSearch.ts')).toBeGreaterThan(score('fs', 'src/offsets.ts') ?? 0)
  })

  it('should rank letters together above scattered letters when scoring', () => {
    expect(score('tabs', 'src/tabs.ts')).toBeGreaterThan(score('tabs', 'src/t-a-b-s.ts') ?? 0)
  })

  it('should prefer the file name to the folders when both hold the letters', () => {
    expect(score('app', 'src/app.ts')).toBeGreaterThan(score('app', 'app/src/index.ts') ?? 0)
  })

  it('should rank the exact name above a longer one starting the same when scoring', () => {
    expect(score('app', 'ui/app.ts')).toBeGreaterThan(score('app', 'ui/apple.ts') ?? 0)
  })

  it('should ignore case when the query is in lowercase', () => {
    expect(score('readme', 'docs/README.md')).toBeDefined()
  })

  it('should match case for case when the query has a capital', () => {
    expect(score('Readme', 'docs/README.md')).toBeUndefined()
    expect(score('README', 'docs/README.md')).toBeDefined()
  })

  it('should ignore spaces in the query when matching', () => {
    expect(score('ui app', 'packages/ui/src/app.ts')).toBeDefined()
  })
})

describe('strictNameScore', () => {
  it('should find a dot file when the query is its name without the dot', () => {
    expect(strictNameScore('env', '.env')).toBeDefined()
    expect(strictNameScore('env', 'config/.env.local')).toBeDefined()
    expect(strictNameScore('.env', '.env')).toBeDefined()
  })

  it('should not match when the query has fewer than three letters', () => {
    expect(strictNameScore('en', '.env')).toBeUndefined()
    expect(strictNameScore('.en', '.env')).toBeUndefined()
  })

  it('should not match when the letters are scattered across the path', () => {
    expect(strictNameScore('env', 'node_modules/e/n/v.js')).toBeUndefined()
    expect(strictNameScore('env', 'environment/readme.md')).toBeUndefined()
  })

  it('should match a closed folder by its name when the query is inside it', () => {
    expect(strictNameScore('modules', 'node_modules/')).toBeDefined()
  })

  it('should follow smart case when the query has a capital', () => {
    expect(strictNameScore('Env', '.env')).toBeUndefined()
    expect(strictNameScore('env', '.ENV')).toBeDefined()
  })

  it('should rank a name starting with the query above one containing it', () => {
    expect(strictNameScore('env', '.env') ?? 0).toBeGreaterThan(
      strictNameScore('env', 'dev.env') ?? 0,
    )
  })
})

describe('createFileMatcher', () => {
  it('should return the best matches first and count all of them when ranking', () => {
    const paths = ['src/domain.ts', 'src/main.ts', 'docs/maintenance.md', 'README.md']

    const result = createFileMatcher(paths).rank('main', 2)

    expect(result.indices.map((index) => paths[index])).toEqual([
      'src/main.ts',
      'docs/maintenance.md',
    ])
    expect(result.total).toBe(3)
  })

  it('should prefer the shorter path when two paths score the same', () => {
    expect(ranked(['deep/folder/app.ts', 'a/app.ts'], 'app')).toEqual([
      'a/app.ts',
      'deep/folder/app.ts',
    ])
  })

  it('should give the same answer when the query grows letter by letter', () => {
    const paths = ['src/app.ts', 'src/apple.ts', 'src/api.ts', 'lib/zap.ts']
    const matcher = createFileMatcher(paths)

    matcher.rank('a', 10)
    matcher.rank('ap', 10)
    const grown = matcher.rank('app', 10)

    expect(grown.indices.map((index) => paths[index])).toEqual(ranked(paths, 'app'))
  })

  it('should search the whole list again when the query no longer extends the previous one', () => {
    const paths = ['src/app.ts', 'src/main.ts']
    const matcher = createFileMatcher(paths)

    matcher.rank('app', 10)
    const other = matcher.rank('main', 10)

    expect(other.indices.map((index) => paths[index])).toEqual(['src/main.ts'])
  })

  it('should raise a path given a bonus when it matches about as well as another', () => {
    const paths = ['a/index.ts', 'b/index.ts']

    const result = createFileMatcher(paths).rank('index', 10, new Map([[1, 15]]))

    expect(result.indices).toEqual([1, 0])
  })
})

describe('nameOf and folderOf', () => {
  it('should split a path into its name and its folders', () => {
    expect(nameOf('packages/ui/app.ts')).toBe('app.ts')
    expect(folderOf('packages/ui/app.ts')).toBe('packages/ui')
    expect(folderOf('app.ts')).toBe('')
  })

  it('should keep the slash of a closed folder in its name', () => {
    expect(nameOf('packages/node_modules/')).toBe('node_modules/')
    expect(folderOf('packages/node_modules/')).toBe('packages')
  })
})
