import { describe, expect, it } from 'vitest'
import { checkText } from './check.ts'
import { BUILT_IN_STANDARDS, builtInStandardFiles } from './examples.ts'
import { ruleFields, withRuleField } from './fields.ts'
import { renderGuide } from './guide.ts'
import { resolveStandards, type StandardFile } from './resolve.ts'

// What a user writes in their repository to change a built-in example
const override = (frontMatter: { id: string } & Record<string, unknown>): StandardFile => ({
  source: 'repository',
  extension: 'dck.repository',
  path: `/home/ana/acme/backend/.dck/standards/${frontMatter.id}.md`,
  frontMatter,
  body: '',
})

const allEnabled = resolveStandards([
  ...builtInStandardFiles(),
  ...BUILT_IN_STANDARDS.map(({ standard }) => override({ id: standard.id, enabled: true })),
]).standards

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
]
const badCommits = [
  'fixed stuff',
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

describe('built-in standards', () => {
  it('should resolve every example without an invalid entry when loaded as files', () => {
    const { standards, invalid } = resolveStandards(builtInStandardFiles())

    expect(invalid).toEqual([])
    expect(standards.map((standard) => standard.id)).toEqual([
      'branch-format',
      'commit-message',
      'mr-description',
      'review-rubric',
    ])
    expect(standards.map((standard) => standard.layers)).toEqual(
      standards.map(({ id }) => [
        { source: 'built-in', extension: 'dck.built-in', path: `built-in/${id}.md` },
      ]),
    )
  })

  it('should ship every example disabled, with a reason and a body, when listed', () => {
    const incomplete = BUILT_IN_STANDARDS.map(({ standard }) => standard).filter(
      ({ enabled, why, body }) => enabled || why.trim() === '' || body.trim() === '',
    )

    expect(incomplete).toEqual([])
  })

  it('should recommend only the branch format and the commit message when listed', () => {
    const recommended = BUILT_IN_STANDARDS.filter((example) => example.recommended)

    expect(recommended.map(({ standard }) => standard.id)).toEqual([
      'branch-format',
      'commit-message',
    ])
  })

  it('should expose the branch names, the types and the length as fields when listing the recommended examples', () => {
    const fields = BUILT_IN_STANDARDS.filter((example) => example.recommended).flatMap(
      ({ standard }) => ruleFields(standard).map((field) => [standard.id, field.name, field.value]),
    )

    expect(fields).toEqual([
      ['branch-format', 'main', 'main|master|develop'],
      ['branch-format', 'types', 'feat|fix|docs|refactor|test|chore|ci'],
      ['commit-message', 'types', 'feat|fix|docs|refactor|test|chore|ci'],
      ['commit-message', 'maxLength', 72],
    ])
  })

  it('should accept a new branch type when the types field of the branch format changes', () => {
    const branchFormat = allEnabled.find((standard) => standard.id === 'branch-format')
    const check = withRuleField(branchFormat?.check ?? [], 0, 'types', 'feat|fix|hotfix')
    const files = [
      ...builtInStandardFiles(),
      override({ id: 'branch-format', enabled: true, check: check.ok ? check.value : [] }),
    ]

    const { standards } = resolveStandards(files)

    expect(checkText(standards, 'branch', 'hotfix/add-login')).toEqual([])
    expect(checkText(standards, 'branch', 'main')).toEqual([])
    expect(checkText(standards, 'branch', 'chore/add-login')).toHaveLength(1)
  })

  it('should guide a review without checking anything when the review rubric is enabled', () => {
    const guide = renderGuide(allEnabled, 'review')

    expect(guide.count).toBe(1)
    expect(guide.text).not.toContain('Checked automatically:')
    expect(failuresOf('review', 'anything')).toEqual([])
  })

  it('should check nothing when no example was enabled', () => {
    const { standards } = resolveStandards(builtInStandardFiles())

    expect(checkText(standards, 'branch', 'Feature/Add_Login')).toEqual([])
    expect(renderGuide(standards, 'branch').count).toBe(0)
  })

  it.each(goodBranches)('should accept the branch %s when the branch format is enabled', (name) => {
    expect(failuresOf('branch', name)).toEqual([])
  })

  it.each(badBranches)('should reject the branch %s when the branch format is enabled', (name) => {
    expect(failuresOf('branch', name)).toMatchObject([{ standard: 'branch-format' }])
  })

  it.each(goodCommits)('should accept the commit %j when the commit message is enabled', (text) => {
    expect(failuresOf('commit', text)).toEqual([])
  })

  it.each(badCommits)('should reject the commit %j when the commit message is enabled', (text) => {
    expect(failuresOf('commit', text)).toMatchObject([{ standard: 'commit-message' }])
  })

  it('should reject a 90 character subject for its length only when the format is right', () => {
    const subject = `feat: ${'a'.repeat(84)}`

    const failures = failuresOf('commit', subject)

    expect(subject).toHaveLength(90)
    expect(failures.map((failure) => failure.kind)).toEqual(['maxLength'])
  })

  it.each(goodDescriptions)(
    'should accept the description %j when the description standard is enabled',
    (text) => {
      expect(failuresOf('pr', text)).toEqual([])
    },
  )

  it.each(badDescriptions)(
    'should reject the description %j when the description standard is enabled',
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
    const files = [
      ...builtInStandardFiles(),
      override({ id: 'branch-format', enabled: true, check }),
    ]

    const { standards, invalid } = resolveStandards(files)
    const guide = renderGuide(standards, 'branch')

    expect(invalid).toEqual([])
    expect(checkText(standards, 'branch', 'feat/ABC-12-add-login')).toEqual([])
    expect(checkText(standards, 'branch', 'feat/add-login')).toMatchObject([
      { message: 'Use <type>/<TICKET>-<slug>, for example feat/ABC-12-add-login' },
    ])
    expect(guide.text).toContain('## Branch names')
    expect(guide.text).toContain('- Use <type>/<TICKET>-<slug>, for example feat/ABC-12-add-login')
    expect(guide.text).not.toContain('- Use <type>/<short-slug> in lowercase')
    expect(standards.find((standard) => standard.id === 'branch-format')?.layers).toHaveLength(2)
    expect(BUILT_IN_STANDARDS[0]?.standard.enabled).toBe(false)
  })
})
