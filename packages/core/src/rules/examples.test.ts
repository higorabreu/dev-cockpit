import { describe, expect, it } from 'vitest'
import { checkText } from './check.ts'
import { BUILT_IN_RULES, builtInRuleFiles } from './examples.ts'
import { ruleFields, withRuleField } from './fields.ts'
import { renderGuide } from './guide.ts'
import { type RuleFile, resolveRules } from './resolve.ts'

// What a user writes in their repository to change a built-in example
const override = (frontMatter: { id: string } & Record<string, unknown>): RuleFile => ({
  source: 'repository',
  extension: 'dck.repository',
  path: `/home/ana/acme/backend/.dck/rules/${frontMatter.id}.md`,
  frontMatter,
  body: '',
})

const allEnabled = resolveRules([
  ...builtInRuleFiles(),
  ...BUILT_IN_RULES.map(({ rule }) => override({ id: rule.id, enabled: true })),
]).rules

const failuresOf = (application: string, text: string) => checkText(allEnabled, application, text)

const goodBranches = ['feat/add-login', 'fix/empty-input-2', 'main', 'develop']
const badBranches = [
  'Feature/Add_Login',
  'feat/Add-Login',
  'add-login',
  'feat/',
  'hotfix/add-login',
]

const goodCommits = [
  'fix(cli): handle empty input',
  'feat: add the login form',
  'refactor(core/ipc)!: drop the legacy handshake',
  'docs: explain the branch format\n\nThe body may be long, with lines well over the limit of the first line.',
  "Merge branch 'main' into feat/x",
  'Revert "feat: add the login form"',
  'fixup! feat: add the login form',
  'squash! fix(cli): handle empty input',
]
const badCommits = [
  'fixed stuff',
  'fixup!feat: add the login form',
  'Fix: handle empty input',
  'fix:handle empty input',
  'feat(): add the login form',
  `feat: ${'a'.repeat(84)}`,
]

const goodDescriptions = [
  '## Summary\n\nAdds the login form.\n\n## Testing\n\nUnit tests and a manual run.\n',
  '# Login\r\n\r\n### Summary\r\nAdds the login form.\r\n\r\n### Testing\r\n- `pnpm test`\r\n',
]
const badDescriptions = [
  '',
  'Adds the login form.',
  '## Summary\n\nAdds the login form.\n',
  '## Summary\n\n## Testing\n\nUnit tests.\n',
  'Summary: adds the login form. Testing: unit tests.',
]

describe('built-in rules', () => {
  it('should resolve every example without an invalid entry when loaded as files', () => {
    const { rules, invalid } = resolveRules(builtInRuleFiles())

    expect(invalid).toEqual([])
    expect(rules.map((rule) => rule.id)).toEqual([
      'branch-format',
      'commit-message',
      'mr-description',
      'review-rubric',
    ])
    expect(rules.map((rule) => rule.layers)).toEqual(
      rules.map(({ id }) => [
        { source: 'built-in', extension: 'dck.built-in', path: `built-in/${id}.md` },
      ]),
    )
  })

  it('should ship every example disabled, with a reason and a body, when listed', () => {
    const incomplete = BUILT_IN_RULES.map(({ rule }) => rule).filter(
      ({ enabled, why, body }) => enabled || why.trim() === '' || body.trim() === '',
    )

    expect(incomplete).toEqual([])
  })

  it('should recommend only the branch format and the commit message when listed', () => {
    const recommended = BUILT_IN_RULES.filter((example) => example.recommended)

    expect(recommended.map(({ rule }) => rule.id)).toEqual(['branch-format', 'commit-message'])
  })

  it('should expose the branch names, the types and the length as fields when listing the recommended examples', () => {
    const fields = BUILT_IN_RULES.filter((example) => example.recommended).flatMap(({ rule }) =>
      ruleFields(rule).map((field) => [rule.id, field.name, field.value]),
    )

    expect(fields).toEqual([
      ['branch-format', 'types', 'feat|fix|docs|refactor|test|chore|ci'],
      ['branch-format', 'longLived', 'main|master|develop'],
      ['commit-message', 'types', 'feat|fix|docs|refactor|test|chore|ci'],
      ['commit-message', 'maxLength', 72],
    ])
  })

  it('should accept a new branch type when the types field of the branch format changes', () => {
    const branchFormat = allEnabled.find((rule) => rule.id === 'branch-format')
    const check = withRuleField(branchFormat?.check ?? [], 0, 'types', 'feat|fix|hotfix')
    const files = [
      ...builtInRuleFiles(),
      override({ id: 'branch-format', enabled: true, check: check.ok ? check.value : [] }),
    ]

    const { rules } = resolveRules(files)

    expect(checkText(rules, 'branch', 'hotfix/add-login')).toEqual([])
    expect(checkText(rules, 'branch', 'main')).toEqual([])
    expect(checkText(rules, 'branch', 'chore/add-login')).toHaveLength(1)
  })

  it('should guide a review without checking anything when the review rubric is enabled', () => {
    const guide = renderGuide(allEnabled, 'review')

    expect(guide.count).toBe(1)
    expect(guide.text).not.toContain('Checked automatically:')
    expect(failuresOf('review', 'anything')).toEqual([])
  })

  it('should check nothing when no example was enabled', () => {
    const { rules } = resolveRules(builtInRuleFiles())

    expect(checkText(rules, 'branch', 'Feature/Add_Login')).toEqual([])
    expect(renderGuide(rules, 'branch').count).toBe(0)
  })

  it.each(goodBranches)('should accept the branch %s when the branch format is enabled', (name) => {
    expect(failuresOf('branch', name)).toEqual([])
  })

  it.each(badBranches)('should reject the branch %s when the branch format is enabled', (name) => {
    expect(failuresOf('branch', name)).toMatchObject([{ rule: 'branch-format' }])
  })

  it.each(goodCommits)('should accept the commit %j when the commit message is enabled', (text) => {
    expect(failuresOf('commit', text)).toEqual([])
  })

  it.each(badCommits)('should reject the commit %j when the commit message is enabled', (text) => {
    expect(failuresOf('commit', text)).toMatchObject([{ rule: 'commit-message' }])
  })

  it('should reject a 90 character subject for its length only when the format is right', () => {
    const subject = `feat: ${'a'.repeat(84)}`

    const failures = failuresOf('commit', subject)

    expect(subject).toHaveLength(90)
    expect(failures.map((failure) => failure.kind)).toEqual(['maxLength'])
  })

  it.each(goodDescriptions)(
    'should accept the description %j when the description rule is enabled',
    (text) => {
      expect(failuresOf('pr', text)).toEqual([])
    },
  )

  it.each(badDescriptions)(
    'should reject the description %j when the description rule is enabled',
    (text) => {
      expect(failuresOf('pr', text).length).toBeGreaterThan(0)
    },
  )

  it('should apply the change to the guide and the check when a higher file enables an example and replaces one field', () => {
    const check = [
      {
        pattern: '^(feat|fix|chore)/{ticket}-[a-z0-9-]+$',
        variables: { ticket: '[A-Z]+-[0-9]+' },
        message: 'Use <type>/<TICKET>-<slug>, for example feat/ABC-12-add-login',
      },
    ]
    const files = [...builtInRuleFiles(), override({ id: 'branch-format', enabled: true, check })]

    const { rules, invalid } = resolveRules(files)
    const guide = renderGuide(rules, 'branch')

    expect(invalid).toEqual([])
    expect(checkText(rules, 'branch', 'feat/ABC-12-add-login')).toEqual([])
    expect(checkText(rules, 'branch', 'feat/add-login')).toMatchObject([
      { message: 'Use <type>/<TICKET>-<slug>, for example feat/ABC-12-add-login' },
    ])
    expect(guide.text).toContain('## Branch names')
    expect(guide.text).toContain('- Use <type>/<TICKET>-<slug>, for example feat/ABC-12-add-login')
    expect(guide.text).not.toContain('- Use <type>/<short-slug> in lowercase')
    expect(rules.find((rule) => rule.id === 'branch-format')?.layers).toHaveLength(2)
    expect(BUILT_IN_RULES[0]?.rule.enabled).toBe(false)
  })
})
