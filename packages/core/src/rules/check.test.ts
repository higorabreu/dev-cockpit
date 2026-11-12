import { describe, expect, it } from 'vitest'
import { CHECK_TEXT_MAX, checkText, type Matcher } from './check.ts'
import { resolveRules } from './resolve.ts'

const rulesWith = (check: unknown, overrides: Record<string, unknown> = {}) =>
  resolveRules([
    {
      source: 'repository',
      extension: 'dck.repository',
      path: '/home/ana/acme/backend/.dck/rules/commit.md',
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
  ]).rules

const kindsOf = (failures: readonly { kind: string }[]) => failures.map((failure) => failure.kind)

describe('checkText', () => {
  it('should return the rule and the check message when a pattern does not match', () => {
    const rules = rulesWith([{ pattern: '^(feat|fix): ', message: 'Start with a type' }])

    const failures = checkText(rules, 'commit', 'updated things')

    expect(failures).toEqual([
      {
        rule: 'commit-message',
        title: 'Commit messages',
        kind: 'pattern',
        message: 'Start with a type',
      },
    ])
  })

  it('should pass when a pattern matches', () => {
    const rules = rulesWith([{ pattern: '^(feat|fix): ', message: 'Start with a type' }])

    const failures = checkText(rules, 'commit', 'fix: handle empty input')

    expect(failures).toEqual([])
  })

  it('should fail a required check when the text holds no match', () => {
    const rules = rulesWith([{ required: 'Refs: ABC-[0-9]+', message: 'Name the ticket' }])

    const missing = checkText(rules, 'commit', 'fix: handle empty input')
    const present = checkText(rules, 'commit', 'fix: handle empty input\n\nRefs: ABC-12')

    expect(kindsOf(missing)).toEqual(['required'])
    expect(present).toEqual([])
  })

  it('should fail a forbid check when the text holds a match', () => {
    const rules = rulesWith([{ forbid: 'WIP', message: 'Remove WIP' }])

    const found = checkText(rules, 'commit', 'WIP: try something')
    const clean = checkText(rules, 'commit', 'fix: handle empty input')

    expect(found).toMatchObject([{ kind: 'forbid', message: 'Remove WIP' }])
    expect(clean).toEqual([])
  })

  it('should fail a maxLength check when the text is longer than the limit', () => {
    const rules = rulesWith([{ maxLength: 10, message: 'At most 10 characters' }])

    const long = checkText(rules, 'commit', 'a'.repeat(11))
    const exact = checkText(rules, 'commit', 'a'.repeat(10))

    expect(kindsOf(long)).toEqual(['maxLength'])
    expect(exact).toEqual([])
  })

  it('should look at the first line only when the scope is first-line', () => {
    const rules = rulesWith([
      { maxLength: 20, scope: 'first-line', message: 'Short subject' },
      { pattern: '^fix: [a-z ]+$', scope: 'first-line', message: 'Lowercase subject' },
      { forbid: 'TODO', scope: 'first-line', message: 'No TODO in the subject' },
    ])

    const failures = checkText(
      rules,
      'commit',
      'fix: handle input\r\n\r\nA long body with a TODO, well over twenty characters.',
    )

    expect(failures).toEqual([])
  })

  it('should look at the whole text when the check sets no scope', () => {
    const rules = rulesWith([{ forbid: 'TODO', message: 'No TODO' }])

    const failures = checkText(rules, 'commit', 'fix: handle input\n\nTODO: the rest')

    expect(kindsOf(failures)).toEqual(['forbid'])
  })

  it('should run only the first line checks when the caller holds the first line only', () => {
    const rules = rulesWith([
      { pattern: '^fix: ', scope: 'first-line', message: 'Start with fix' },
      { required: 'Refs: ABC-[0-9]+', message: 'Name the ticket in the body' },
      { maxLength: 10, message: 'At most 10 characters in all' },
      { maxLength: 12, scope: 'first-line', message: 'Short subject' },
    ])

    const failures = checkText(rules, 'commit', 'handle empty input', { firstLineOnly: true })

    expect(failures.map((failure) => failure.message)).toEqual(['Start with fix', 'Short subject'])
  })

  it('should pass when the caller holds the first line only and no check looks at the first line', () => {
    const rules = rulesWith([{ required: 'Refs: ABC-[0-9]+', message: 'Name the ticket' }])

    const failures = checkText(rules, 'commit', 'fix: handle empty input', {
      firstLineOnly: true,
    })

    expect(failures).toEqual([])
  })

  it('should report every failing check when several fail', () => {
    const rules = rulesWith([
      { pattern: '^fix: ', message: 'Start with fix' },
      { maxLength: 5, message: 'At most 5 characters' },
      { required: 'input', message: 'Mention the input' },
    ])

    const failures = checkText(rules, 'commit', 'handle empty input')

    expect(kindsOf(failures)).toEqual(['pattern', 'maxLength'])
  })

  it('should skip a rule when it is disabled', () => {
    const rules = rulesWith([{ forbid: 'WIP', message: 'Remove WIP' }], { enabled: false })

    const failures = checkText(rules, 'commit', 'WIP')

    expect(failures).toEqual([])
  })

  it('should skip a rule when it applies to another application', () => {
    const rules = rulesWith([{ forbid: 'WIP', message: 'Remove WIP' }])

    const failures = checkText(rules, 'branch', 'WIP')

    expect(failures).toEqual([])
  })

  it('should ignore what comes after the first 20000 characters when the text is longer', () => {
    const rules = rulesWith([{ forbid: 'WIP', message: 'Remove WIP' }])
    const inside = `${'a'.repeat(CHECK_TEXT_MAX - 3)}WIP`

    const cut = checkText(rules, 'commit', `a${inside}`)
    const whole = checkText(rules, 'commit', inside)

    expect(CHECK_TEXT_MAX).toBe(20000)
    expect(cut).toEqual([])
    expect(kindsOf(whole)).toEqual(['forbid'])
  })

  it('should fail with the kind timeout and the check message when the matcher times out', () => {
    const rules = rulesWith([
      { pattern: '^(a+)+$', message: 'Only the letter a' },
      { maxLength: 100, message: 'At most 100 characters' },
    ])
    const match: Matcher = () => 'timeout'

    const failures = checkText(rules, 'commit', 'aaaa', { match })

    expect(failures).toEqual([
      {
        rule: 'commit-message',
        title: 'Commit messages',
        kind: 'timeout',
        message: 'Only the letter a',
      },
    ])
  })

  it.each([['\n'], ['\r\n']])(
    'should pass a pattern anchored with $ when the text ends with one line break (%j)',
    (lineBreak) => {
      const rules = rulesWith([{ pattern: '^fix: \\S.*$', message: 'Start with fix' }])

      const failures = checkText(rules, 'commit', `fix: handle empty input${lineBreak}`)

      expect(failures).toEqual([])
    },
  )

  it('should run no other expression and still check the length when one expression times out', () => {
    const rules = rulesWith([
      { pattern: '^(a+)+$', message: 'Only the letter a' },
      { forbid: 'b', message: 'No b' },
      { maxLength: 3, message: 'At most 3 characters' },
      { required: 'a', message: 'Some a' },
    ])
    let calls = 0
    const match: Matcher = () => {
      calls += 1
      return 'timeout'
    }

    const failures = checkText(rules, 'commit', 'aaaa', { match })

    expect(calls).toBe(1)
    expect(kindsOf(failures)).toEqual(['timeout', 'timeout', 'maxLength', 'timeout'])
  })

  it('should hand the compiled expression and the text to the matcher when one is injected', () => {
    const rules = rulesWith([
      { forbid: '{word}', variables: { word: 'WIP' }, message: 'Remove WIP' },
    ])
    const calls: [string, string][] = []
    const match: Matcher = (expression, text) => {
      calls.push([expression.source, text])
      return 'no-match'
    }

    const failures = checkText(rules, 'commit', 'fix: done', { match })

    expect(failures).toEqual([])
    expect(calls).toEqual([['(?:WIP)', 'fix: done']])
  })
})
