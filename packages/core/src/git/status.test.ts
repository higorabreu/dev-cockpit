import { describe, expect, it } from 'vitest'
import {
  countDistinctFiles,
  formatAgo,
  parseGitLog,
  parseGitStatus,
  parseSubmoduleList,
  ticketFromBranch,
} from './status.ts'

const z = (...records: string[]) => `${records.join('\0')}\0`

describe('parseGitStatus', () => {
  it('should report the branch and nothing else when the tree is clean', () => {
    const parsed = parseGitStatus(z('# branch.oid abc', '# branch.head main'))

    expect(parsed).toMatchObject({ branch: 'main', staged: [], changes: [], ahead: 0, behind: 0 })
  })

  it('should split staged and unstaged changes of the same file when both columns are set', () => {
    const parsed = parseGitStatus(z('1 MM N... 100644 100644 100644 a b src/a.ts'))

    expect(parsed.staged).toEqual([{ status: 'M', path: 'src/a.ts' }])
    expect(parsed.changes).toEqual([{ status: 'M', path: 'src/a.ts' }])
  })

  it('should put a new file in the index in staged only when it is added', () => {
    const parsed = parseGitStatus(z('1 A. N... 000000 100644 100644 a b new.txt'))

    expect(parsed.staged).toEqual([{ status: 'A', path: 'new.txt' }])
    expect(parsed.changes).toEqual([])
  })

  it('should read a deleted file in the working tree as D when it is deleted', () => {
    const parsed = parseGitStatus(z('1 .D N... 100644 100644 000000 a b old.md'))

    expect(parsed.changes).toEqual([{ status: 'D', path: 'old.md' }])
  })

  it('should read the new path and skip the origin record when a file is renamed', () => {
    const parsed = parseGitStatus(
      z('2 R. N... 100644 100644 100644 a b R100 src/new.ts', 'src/old.ts', '? other.txt'),
    )

    expect(parsed.staged).toEqual([{ status: 'R', path: 'src/new.ts' }])
    expect(parsed.changes).toEqual([{ status: 'U', path: 'other.txt' }])
  })

  it('should mark untracked files as U when listing changes', () => {
    expect(parseGitStatus(z('? notes.txt')).changes).toEqual([{ status: 'U', path: 'notes.txt' }])
  })

  it('should mark an unmerged file as in conflict when it is unmerged', () => {
    const parsed = parseGitStatus(z('u UU N... 1 2 3 4 a b c src/conflict.ts'))

    expect(parsed.changes).toEqual([{ status: '!', path: 'src/conflict.ts' }])
  })

  it('should keep spaces in paths when the path has spaces', () => {
    const parsed = parseGitStatus(z('1 .M N... 100644 100644 100644 a b my docs/read me.md'))

    expect(parsed.changes[0]?.path).toBe('my docs/read me.md')
  })

  it('should list submodules apart from the files when an entry is a submodule', () => {
    const parsed = parseGitStatus(
      z(
        '1 .M SCMU 160000 160000 160000 a b backend',
        '1 .M SC.. 160000 160000 160000 a b frontend',
        '1 .M N... 100644 100644 100644 a b Makefile',
      ),
    )

    expect(parsed.submodules).toEqual([
      { path: 'backend', pointerChanged: true },
      { path: 'frontend', pointerChanged: true },
    ])
    expect(parsed.changes).toEqual([{ status: 'M', path: 'Makefile' }])
  })

  it('should not flag the pointer when only the submodule content changed', () => {
    const parsed = parseGitStatus(z('1 .M S.M. 160000 160000 160000 a b backend'))

    expect(parsed.submodules).toEqual([{ path: 'backend', pointerChanged: false }])
  })

  it('should read the upstream and how far the branch is from it when it has one', () => {
    const parsed = parseGitStatus(
      z('# branch.head main', '# branch.upstream origin/main', '# branch.ab +3 -1'),
    )

    expect(parsed).toMatchObject({ upstream: 'origin/main', ahead: 3, behind: 1 })
  })

  it('should have no branch when the head is detached', () => {
    expect(parseGitStatus(z('# branch.head (detached)')).branch).toBeUndefined()
  })

  it('should sort the files by path when listing', () => {
    const parsed = parseGitStatus(z('? b.txt', '? a.txt'))

    expect(parsed.changes.map((file) => file.path)).toEqual(['a.txt', 'b.txt'])
  })
})

describe('countDistinctFiles', () => {
  it('should count a file once when it is in both lists', () => {
    const file = { status: 'M' as const, path: 'a.ts' }

    expect(countDistinctFiles([file], [file, { status: 'U', path: 'b.ts' }])).toBe(2)
  })
})

describe('parseGitLog', () => {
  it('should read hash, subject and time from every record when parsing', () => {
    const output =
      'a3f9c21\u001ffeat: add endpoint\u001f1700000000\u001e\n9be01d4\u001ftest: cover key\u001f1699990000\u001e'

    expect(parseGitLog(output)).toEqual([
      { hash: 'a3f9c21', subject: 'feat: add endpoint', time: 1700000000 },
      { hash: '9be01d4', subject: 'test: cover key', time: 1699990000 },
    ])
  })

  it('should return nothing when the output is empty', () => {
    expect(parseGitLog('')).toEqual([])
  })

  it('should keep a subject that has colons and brackets when parsing', () => {
    const output = 'abc1234\u001f[NTF-400] feat: add: thing\u001f1700000000\u001e'

    expect(parseGitLog(output)[0]?.subject).toBe('[NTF-400] feat: add: thing')
  })
})

describe('parseSubmoduleList', () => {
  const sha = 'a'.repeat(40)

  it('should read the path and whether it is initialized when listing', () => {
    const output = [
      ` ${sha} backend (heads/main)`,
      `-${sha} frontend`,
      `+${sha} email (v1-2-gabc)`,
    ].join('\n')

    expect(parseSubmoduleList(output)).toEqual([
      { path: 'backend', initialized: true },
      { path: 'frontend', initialized: false },
      { path: 'email', initialized: true },
    ])
  })

  it('should return nothing when there are no submodules', () => {
    expect(parseSubmoduleList('')).toEqual([])
  })
})

describe('ticketFromBranch', () => {
  it('should find the ticket key when the branch has one', () => {
    expect(ticketFromBranch('feature/NTF-400-api-publica')).toBe('NTF-400')
    expect(ticketFromBranch('NTF-12-fix')).toBe('NTF-12')
  })

  it('should find nothing when the branch has no ticket key', () => {
    expect(ticketFromBranch('main')).toBeUndefined()
    expect(ticketFromBranch(undefined)).toBeUndefined()
  })
})

describe('formatAgo', () => {
  it('should use the largest fitting unit when formatting', () => {
    expect(formatAgo(10_000, 10_000 - 7200)).toBe('há 2 h')
    expect(formatAgo(200_000, 200_000 - 90_000)).toBe('há 1 d')
    expect(formatAgo(1000, 1000 - 300)).toBe('há 5 min')
  })

  it('should say now when it was moments ago', () => {
    expect(formatAgo(1000, 990)).toBe('agora')
  })
})
