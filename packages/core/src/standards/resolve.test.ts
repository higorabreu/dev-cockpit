import { describe, expect, it } from 'vitest'
import type { ExtensionSource } from '../extensions/load.ts'
import { resolveStandards, type StandardFile } from './resolve.ts'

const FOLDERS: Record<ExtensionSource, string> = {
  'built-in': 'built-in',
  installed: '/home/ana/.config/dck/extensions/acme.flow/standards',
  global: '/home/ana/.config/dck/standards',
  repository: '/home/ana/acme/backend/.dck/standards',
}

const file = (
  source: ExtensionSource,
  frontMatter: unknown,
  body = '',
  name = 'branch.md',
): StandardFile => ({
  source,
  extension: source === 'installed' ? 'acme.flow' : `dck.${source}`,
  path: `${FOLDERS[source]}/${name}`,
  frontMatter,
  body,
})

const branch = {
  id: 'branch-format',
  title: 'Branch names',
  applies: 'branch',
  why: 'Work is traceable from the branch name',
}

describe('resolveStandards', () => {
  it('should fill the defaults when a file declares only the required fields', () => {
    const files = [file('repository', branch, 'Name the branch after the work.\n')]

    const { standards, invalid } = resolveStandards(files)

    expect(invalid).toEqual([])
    expect(standards).toEqual([
      {
        ...branch,
        paths: [],
        enabled: true,
        check: [],
        body: 'Name the branch after the work.',
        layers: [
          {
            source: 'repository',
            extension: 'dck.repository',
            path: '/home/ana/acme/backend/.dck/standards/branch.md',
          },
        ],
        rules: [],
      },
    ])
  })

  it('should replace only the declared fields when a higher file repeats the id', () => {
    const files = [
      file('built-in', { ...branch, enabled: false, paths: ['src/**'] }, 'Built-in body'),
      file('repository', { id: 'branch-format', enabled: true, title: 'Our branches' }),
    ]

    const { standards } = resolveStandards(files)

    expect(standards[0]).toMatchObject({
      title: 'Our branches',
      enabled: true,
      applies: 'branch',
      why: 'Work is traceable from the branch name',
      paths: ['src/**'],
      body: 'Built-in body',
    })
  })

  it('should replace the check list as a whole when a higher file declares one', () => {
    const lower = [
      { pattern: '^feat/', message: 'Start with feat/' },
      { maxLength: 50, message: 'At most 50 characters' },
    ]
    const higher = [{ forbid: '_', message: 'No underscores' }]
    const files = [
      file('global', { ...branch, check: lower }),
      file('repository', { id: 'branch-format', check: higher }),
    ]

    const { standards } = resolveStandards(files)

    expect(standards[0]?.check).toEqual(higher)
    expect(standards[0]?.rules).toMatchObject([{ kind: 'forbid', message: 'No underscores' }])
  })

  it('should replace the body as a whole when the higher body is not blank', () => {
    const files = [
      file('global', branch, 'Line one.\nLine two.'),
      file('repository', { id: 'branch-format' }, 'Only this.'),
    ]

    const { standards } = resolveStandards(files)

    expect(standards[0]?.body).toBe('Only this.')
  })

  it('should keep the lower body when the higher body is blank', () => {
    const files = [
      file('global', branch, 'Lower body.'),
      file('repository', { id: 'branch-format' }, ' \n'),
    ]

    const { standards } = resolveStandards(files)

    expect(standards[0]?.body).toBe('Lower body.')
  })

  it('should let the repository win over global, installed and built-in when all repeat the id', () => {
    const files = [
      file('repository', { id: 'branch-format', title: 'From the repository' }),
      file('built-in', { ...branch, title: 'From built-in' }),
      file('global', { id: 'branch-format', title: 'From global', why: 'Global reason' }),
      file('installed', { id: 'branch-format', title: 'From a pack', applies: 'commit' }),
    ]

    const { standards } = resolveStandards(files)

    expect(standards[0]).toMatchObject({
      title: 'From the repository',
      why: 'Global reason',
      applies: 'commit',
    })
    expect(standards[0]?.layers).toEqual([
      { source: 'built-in', extension: 'dck.built-in', path: 'built-in/branch.md' },
      {
        source: 'installed',
        extension: 'acme.flow',
        path: '/home/ana/.config/dck/extensions/acme.flow/standards/branch.md',
      },
      {
        source: 'global',
        extension: 'dck.global',
        path: '/home/ana/.config/dck/standards/branch.md',
      },
      {
        source: 'repository',
        extension: 'dck.repository',
        path: '/home/ana/acme/backend/.dck/standards/branch.md',
      },
    ])
  })

  it('should layer in the given order when two files come from the same source', () => {
    const files = [
      file('installed', { ...branch, title: 'First pack' }, '', 'a.md'),
      file('installed', { id: 'branch-format', title: 'Second pack' }, '', 'b.md'),
    ]

    const { standards } = resolveStandards(files)

    expect(standards[0]?.title).toBe('Second pack')
  })

  it('should sort the standards by id when several resolve', () => {
    const files = [
      file('repository', { ...branch, id: 'review-rubric' }, '', 'review.md'),
      file('repository', { ...branch, id: 'branch-format' }),
    ]

    const { standards } = resolveStandards(files)

    expect(standards.map((standard) => standard.id)).toEqual(['branch-format', 'review-rubric'])
  })

  it('should report an invalid file with its path and field when the others still load', () => {
    const files = [
      file('repository', { ...branch, id: 'Branch Format' }, '', 'bad.md'),
      file('repository', { ...branch, id: 'commit-message', applies: 'commit' }, '', 'commit.md'),
    ]

    const { standards, invalid } = resolveStandards(files)

    expect(standards.map((standard) => standard.id)).toEqual(['commit-message'])
    expect(invalid).toHaveLength(1)
    expect(invalid[0]).toMatchObject({
      path: '/home/ana/acme/backend/.dck/standards/bad.md',
      source: 'repository',
      error: { data: { code: 'DCK-STD-001' } },
    })
    expect(invalid[0]?.error.message).toContain('/home/ana/acme/backend/.dck/standards/bad.md: id:')
  })

  it.each([
    ['an unknown field', { ...branch, severity: 'high' }, 'severity'],
    ['a title over 100 characters', { ...branch, title: 'a'.repeat(101) }, 'title:'],
    ['a blank why', { ...branch, why: '  ' }, 'why:'],
    ['an applies that is not kebab case', { ...branch, applies: 'Code Style' }, 'applies:'],
    [
      'more than 20 rules',
      { ...branch, check: Array(21).fill({ maxLength: 5, message: 'Long' }) },
      'check:',
    ],
    ['a rule without a message', { ...branch, check: [{ pattern: '^a' }] }, 'check.0.message:'],
    ['a rule with an unknown key', { ...branch, check: [{ run: 'x.sh', message: 'No' }] }, 'run'],
    [
      'a rule with two kinds',
      { ...branch, check: [{ pattern: 'a', forbid: 'b', message: 'No' }] },
      'check.0: needs exactly one',
    ],
    [
      'a rule with no kind',
      { ...branch, check: [{ message: 'No' }] },
      'check.0: needs exactly one',
    ],
    [
      'an expression over 500 characters',
      { ...branch, check: [{ pattern: 'a'.repeat(501), message: 'No' }] },
      'check.0.pattern:',
    ],
    [
      'a maxLength that is not positive',
      { ...branch, check: [{ maxLength: 0, message: 'No' }] },
      'check.0.maxLength:',
    ],
    [
      'an unknown scope',
      { ...branch, check: [{ maxLength: 5, scope: 'line', message: 'No' }] },
      'check.0.scope:',
    ],
    ['a front matter that is not an object', undefined, 'front matter:'],
  ])('should report the field when the file has %s', (_case, frontMatter, expected) => {
    const files = [file('repository', frontMatter)]

    const { standards, invalid } = resolveStandards(files)

    expect(standards).toEqual([])
    expect(invalid[0]?.error.message).toContain(expected)
  })

  it('should accept a free application name when it is lowercase kebab case', () => {
    const files = [file('repository', { ...branch, applies: 'release-notes' })]

    const { standards, invalid } = resolveStandards(files)

    expect(invalid).toEqual([])
    expect(standards[0]?.applies).toBe('release-notes')
  })

  it('should report the highest file when the merged standard is still incomplete', () => {
    const files = [
      file('global', { id: 'branch-format', title: 'Branch names' }),
      file('repository', { id: 'branch-format', enabled: true }),
    ]

    const { standards, invalid } = resolveStandards(files)

    expect(standards).toEqual([])
    expect(invalid).toHaveLength(1)
    expect(invalid[0]).toMatchObject({
      source: 'repository',
      error: { data: { code: 'DCK-STD-001' } },
    })
    expect(invalid[0]?.error.message).toContain(
      '/home/ana/acme/backend/.dck/standards/branch.md: applies: required; why: required',
    )
  })

  it('should report the standard when a rule uses an unknown variable', () => {
    const check = [{ pattern: '^{ticket}-', variables: { key: '[A-Z]+' }, message: 'Bad' }]
    const files = [file('repository', { ...branch, check })]

    const { standards, invalid } = resolveStandards(files)

    expect(standards).toEqual([])
    expect(invalid[0]?.error.message).toContain(
      '/home/ana/acme/backend/.dck/standards/branch.md: check.0.pattern: unknown variable {ticket}',
    )
  })

  it('should report the standard when a rule is not a valid regular expression', () => {
    const check = [
      { maxLength: 50, message: 'Fine' },
      { required: '[a-', message: 'Bad' },
    ]
    const files = [file('repository', { ...branch, check })]

    const { standards, invalid } = resolveStandards(files)

    expect(standards).toEqual([])
    expect(invalid[0]?.error.message).toContain('branch.md: check.1.required:')
  })
})
