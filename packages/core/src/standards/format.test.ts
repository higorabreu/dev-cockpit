import { describe, expect, it } from 'vitest'
import { formatStandardFile } from './format.ts'
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

  it('should write only the declared fields when the standard is a minimal override', () => {
    const text = formatStandardFile({ id: 'branch-format', enabled: true })

    expect(text).toBe("---\nid: 'branch-format'\nenabled: true\n---\n")
  })

  it('should write empty lists inline when the standard has no paths and no rules', () => {
    const text = formatStandardFile({ id: 'review-rubric', paths: [], enabled: false, check: [] })

    expect(text).toBe("---\nid: 'review-rubric'\npaths: []\nenabled: false\ncheck: []\n---\n")
  })
})
