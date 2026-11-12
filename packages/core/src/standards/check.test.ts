import { describe, expect, it } from 'vitest'
import { CHECK_TEXT_MAX, checkText, type Matcher } from './check.ts'
import { resolveStandards } from './resolve.ts'

const standardsWith = (check: unknown, overrides: Record<string, unknown> = {}) =>
  resolveStandards([
    {
      source: 'repository',
      extension: 'dck.repository',
      path: '/home/ana/acme/backend/.dck/standards/commit.md',
      frontMatter: {
        id: 'commit-message',
        title: 'Commit messages',
        applies: 'commit',
        why: 'The history reads as a changelog',
        check,
        ...overrides,
      },
      body: '',
    },
  ]).standards

const kindsOf = (failures: readonly { kind: string }[]) => failures.map((failure) => failure.kind)

describe('checkText', () => {
  it('should return the standard and the rule message when a pattern does not match', () => {
    const standards = standardsWith([{ pattern: '^(feat|fix): ', message: 'Start with a type' }])

    const failures = checkText(standards, 'commit', 'updated things')

    expect(failures).toEqual([
      {
        standard: 'commit-message',
        title: 'Commit messages',
        kind: 'pattern',
        message: 'Start with a type',
      },
    ])
  })

  it('should pass when a pattern matches', () => {
    const standards = standardsWith([{ pattern: '^(feat|fix): ', message: 'Start with a type' }])

    const failures = checkText(standards, 'commit', 'fix: handle empty input')

    expect(failures).toEqual([])
  })

  it('should fail a required rule when the text holds no match', () => {
    const standards = standardsWith([{ required: 'Refs: ABC-[0-9]+', message: 'Name the ticket' }])

    const missing = checkText(standards, 'commit', 'fix: handle empty input')
    const present = checkText(standards, 'commit', 'fix: handle empty input\n\nRefs: ABC-12')

    expect(kindsOf(missing)).toEqual(['required'])
    expect(present).toEqual([])
  })

  it('should fail a forbid rule when the text holds a match', () => {
    const standards = standardsWith([{ forbid: 'WIP', message: 'Remove WIP' }])

    const found = checkText(standards, 'commit', 'WIP: try something')
    const clean = checkText(standards, 'commit', 'fix: handle empty input')

    expect(found).toMatchObject([{ kind: 'forbid', message: 'Remove WIP' }])
    expect(clean).toEqual([])
  })

  it('should fail a maxLength rule when the text is longer than the limit', () => {
    const standards = standardsWith([{ maxLength: 10, message: 'At most 10 characters' }])

    const long = checkText(standards, 'commit', 'a'.repeat(11))
    const exact = checkText(standards, 'commit', 'a'.repeat(10))

    expect(kindsOf(long)).toEqual(['maxLength'])
    expect(exact).toEqual([])
  })

  it('should look at the first line only when the scope is first-line', () => {
    const standards = standardsWith([
      { maxLength: 20, scope: 'first-line', message: 'Short subject' },
      { pattern: '^fix: [a-z ]+$', scope: 'first-line', message: 'Lowercase subject' },
      { forbid: 'TODO', scope: 'first-line', message: 'No TODO in the subject' },
    ])

    const failures = checkText(
      standards,
      'commit',
      'fix: handle input\r\n\r\nA long body with a TODO, well over twenty characters.',
    )

    expect(failures).toEqual([])
  })

  it('should look at the whole text when the rule sets no scope', () => {
    const standards = standardsWith([{ forbid: 'TODO', message: 'No TODO' }])

    const failures = checkText(standards, 'commit', 'fix: handle input\n\nTODO: the rest')

    expect(kindsOf(failures)).toEqual(['forbid'])
  })

  it('should run only the first line rules when the caller holds the first line only', () => {
    const standards = standardsWith([
      { pattern: '^fix: ', scope: 'first-line', message: 'Start with fix' },
      { required: 'Refs: ABC-[0-9]+', message: 'Name the ticket in the body' },
      { maxLength: 10, message: 'At most 10 characters in all' },
      { maxLength: 12, scope: 'first-line', message: 'Short subject' },
    ])

    const failures = checkText(standards, 'commit', 'handle empty input', { firstLineOnly: true })

    expect(failures.map((failure) => failure.message)).toEqual(['Start with fix', 'Short subject'])
  })

  it('should pass when the caller holds the first line only and no rule looks at the first line', () => {
    const standards = standardsWith([{ required: 'Refs: ABC-[0-9]+', message: 'Name the ticket' }])

    const failures = checkText(standards, 'commit', 'fix: handle empty input', {
      firstLineOnly: true,
    })

    expect(failures).toEqual([])
  })

  it('should report every failing rule when several fail', () => {
    const standards = standardsWith([
      { pattern: '^fix: ', message: 'Start with fix' },
      { maxLength: 5, message: 'At most 5 characters' },
      { required: 'input', message: 'Mention the input' },
    ])

    const failures = checkText(standards, 'commit', 'handle empty input')

    expect(kindsOf(failures)).toEqual(['pattern', 'maxLength'])
  })

  it('should skip a standard when it is disabled', () => {
    const standards = standardsWith([{ forbid: 'WIP', message: 'Remove WIP' }], { enabled: false })

    const failures = checkText(standards, 'commit', 'WIP')

    expect(failures).toEqual([])
  })

  it('should skip a standard when it applies to another application', () => {
    const standards = standardsWith([{ forbid: 'WIP', message: 'Remove WIP' }])

    const failures = checkText(standards, 'branch', 'WIP')

    expect(failures).toEqual([])
  })

  it('should ignore what comes after the first 20000 characters when the text is longer', () => {
    const standards = standardsWith([{ forbid: 'WIP', message: 'Remove WIP' }])
    const inside = `${'a'.repeat(CHECK_TEXT_MAX - 3)}WIP`

    const cut = checkText(standards, 'commit', `a${inside}`)
    const whole = checkText(standards, 'commit', inside)

    expect(CHECK_TEXT_MAX).toBe(20000)
    expect(cut).toEqual([])
    expect(kindsOf(whole)).toEqual(['forbid'])
  })

  it('should fail with the kind timeout and the rule message when the matcher times out', () => {
    const standards = standardsWith([
      { pattern: '^(a+)+$', message: 'Only the letter a' },
      { maxLength: 100, message: 'At most 100 characters' },
    ])
    const match: Matcher = () => 'timeout'

    const failures = checkText(standards, 'commit', 'aaaa', { match })

    expect(failures).toEqual([
      {
        standard: 'commit-message',
        title: 'Commit messages',
        kind: 'timeout',
        message: 'Only the letter a',
      },
    ])
  })

  it('should hand the compiled expression and the text to the matcher when one is injected', () => {
    const standards = standardsWith([
      { forbid: '{word}', variables: { word: 'WIP' }, message: 'Remove WIP' },
    ])
    const calls: [string, string][] = []
    const match: Matcher = (expression, text) => {
      calls.push([expression.source, text])
      return 'no-match'
    }

    const failures = checkText(standards, 'commit', 'fix: done', { match })

    expect(failures).toEqual([])
    expect(calls).toEqual([['(?:WIP)', 'fix: done']])
  })
})
