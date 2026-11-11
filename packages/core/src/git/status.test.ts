import { describe, expect, it } from 'vitest'
import { parseGitStatus } from './status.ts'

const clean = ['# branch.oid abc', '# branch.head main'].join('\n')

describe('parseGitStatus', () => {
  it('should report the branch and no changes when the tree is clean', () => {
    expect(parseGitStatus(clean)).toEqual({ branch: 'main', changed: 0, ahead: 0, behind: 0 })
  })

  it('should count modified, renamed, unmerged and untracked entries when the tree is dirty', () => {
    const output = [
      '# branch.head dev',
      '1 .M N... 100644 100644 100644 a b src/a.ts',
      '2 R. N... 100644 100644 100644 a b R100 src/new.ts\tsrc/old.ts',
      'u UU N... 1 2 3 4 a b c src/conflict.ts',
      '? notes.txt',
    ].join('\n')

    expect(parseGitStatus(output).changed).toBe(4)
  })

  it('should read how far the branch is from its upstream when it has one', () => {
    const output = [
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +3 -1',
    ].join('\n')

    const status = parseGitStatus(output)

    expect(status.ahead).toBe(3)
    expect(status.behind).toBe(1)
  })

  it('should have no branch when the head is detached', () => {
    expect(parseGitStatus('# branch.head (detached)').branch).toBeUndefined()
  })

  it('should not count ignored entries or comments as changes when parsing', () => {
    const output = ['# branch.head main', '! build/', '# branch.oid abc'].join('\n')

    expect(parseGitStatus(output).changed).toBe(0)
  })

  it('should keep branch names with slashes when parsing', () => {
    expect(parseGitStatus('# branch.head feature/NTF-400-x').branch).toBe('feature/NTF-400-x')
  })
})
