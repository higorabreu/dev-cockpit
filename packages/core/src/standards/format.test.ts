import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { formatStandardFile, splitStandardFile } from './format.ts'
import type { Standard } from './standard.ts'

const full: Standard = {
  id: 'branch-format',
  title: 'Branch names',
  applies: 'branch',
  paths: ['packages/**', 'docs/**'],
  why: "The team's work is traceable",
  enabled: true,
  check: [
    {
      pattern: '^(feat|fix)/{ticket}-[a-z0-9-]+$',
      variables: { ticket: '[A-Z]+-\\d+' },
      message: 'Use <type>/<TICKET>-<slug>, for example feat/ABC-12-add-login',
    },
    { maxLength: 72, scope: 'first-line', message: 'Keep it short' },
    { forbid: '\\s', message: 'No spaces' },
    { required: '/', message: 'Line one\nLine two' },
  ],
  body: '\nName the branch `<type>/<TICKET>-<slug>`.\n\nThe ticket key comes first.\n\n',
}

describe('formatStandardFile', () => {
  it('should write every field in the fixed order when the standard is complete', () => {
    const text = formatStandardFile(full)

    expect(text).toBe(`---
id: 'branch-format'
title: 'Branch names'
applies: 'branch'
paths:
  - 'packages/**'
  - 'docs/**'
why: "The team's work is traceable"
enabled: true
check:
  - pattern: '^(feat|fix)/{ticket}-[a-z0-9-]+$'
    variables:
      ticket: '[A-Z]+-\\d+'
    message: 'Use <type>/<TICKET>-<slug>, for example feat/ABC-12-add-login'
  - maxLength: 72
    scope: 'first-line'
    message: 'Keep it short'
  - forbid: '\\s'
    message: 'No spaces'
  - required: '/'
    message: "Line one\\nLine two"
---
Name the branch \`<type>/<TICKET>-<slug>\`.

The ticket key comes first.
`)
  })

  it('should write empty lists inline when the standard has no paths and no rules', () => {
    const text = formatStandardFile({ ...full, paths: [], check: [], body: '' })

    expect(text).toContain('\npaths: []\n')
    expect(text).toContain('\ncheck: []\n---\n')
  })
})

describe('splitStandardFile', () => {
  it('should quote a variable name YAML would read as a value when it writes the rule', () => {
    const variables = { null: 'a', True: 'b', types: 'feat|fix' }
    const standard = {
      ...full,
      check: [{ pattern: '{null}{True}{types}', variables, message: 'M' }],
    }

    const { yaml } = splitStandardFile(formatStandardFile(standard))

    expect(parse(yaml ?? '').check[0].variables).toEqual(variables)
  })

  it('should separate the front matter from the body when the file starts with a fenced block', () => {
    const parts = splitStandardFile(
      '---\nid: a\nenabled: true\n---\nThe body.\n\n--- not a fence\n',
    )

    expect(parts).toEqual({ yaml: 'id: a\nenabled: true', body: 'The body.\n\n--- not a fence\n' })
  })

  it('should give back what the formatter wrote when the file comes from it', () => {
    const text = formatStandardFile({ ...full, body: 'Check it.' })

    const parts = splitStandardFile(text)

    expect(`---\n${parts.yaml}\n---\n${parts.body}`).toBe(text)
    expect(parts.body).toBe('Check it.\n')
  })

  it('should read the fences when the file has a byte order mark and Windows line endings', () => {
    const parts = splitStandardFile('\uFEFF---\r\nid: a\r\n---\r\nThe body.\r\n')

    expect(parts).toEqual({ yaml: 'id: a', body: 'The body.\n' })
  })

  it.each(['Just a note.\n', '---\nid: a\nnever closed\n', '\n---\nid: a\n---\n', ''])(
    'should find no front matter in %j when the first line is not a closed fence',
    (text) => {
      expect(splitStandardFile(text)).toEqual({ yaml: undefined, body: text })
    },
  )
})
