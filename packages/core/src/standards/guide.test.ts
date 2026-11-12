import { describe, expect, it } from 'vitest'
import { renderGuide, renderIndex } from './guide.ts'
import type { Standard } from './standard.ts'

const branch: Standard = {
  id: 'branch-format',
  title: 'Branch names',
  applies: 'branch',
  paths: [],
  why: 'Work is traceable from the branch name',
  enabled: true,
  check: [
    { pattern: '^(feat|fix)/', message: 'Start with feat/ or fix/' },
    { maxLength: 60, message: 'At most 60 characters' },
  ],
  body: 'Name the branch `<type>/<short-slug>`.',
}

const review: Standard = {
  id: 'review-rubric',
  title: 'Review rubric',
  applies: 'review',
  paths: [],
  why: 'Reviews stay comparable.',
  enabled: true,
  check: [],
  body: 'Check correctness first.',
}

describe('renderGuide', () => {
  it('should render the heading, the body, the reason and the rule messages when a standard has rules', () => {
    const guide = renderGuide([branch, review], 'branch')

    expect(guide.text).toBe(
      [
        '## Branch names',
        '',
        'Name the branch `<type>/<short-slug>`.',
        '',
        'Why: Work is traceable from the branch name',
        '',
        'Checked automatically:',
        '- Start with feat/ or fix/',
        '- At most 60 characters',
      ].join('\n'),
    )
  })

  it('should leave out the checked list when the standard has no rules', () => {
    const guide = renderGuide([branch, review], 'review')

    expect(guide.text).toBe(
      '## Review rubric\n\nCheck correctness first.\n\nWhy: Reviews stay comparable.',
    )
  })

  it('should count the lines and estimate the tokens as characters divided by four when rendering', () => {
    const guide = renderGuide([review], 'review')

    expect(guide.lines).toBe(5)
    expect(guide.tokens).toBe(Math.ceil(guide.text.length / 4))
    expect(guide.count).toBe(1)
  })

  it('should join the standards with a blank line when several apply', () => {
    const second = { ...review, id: 'branch-owner', applies: 'branch' }

    const guide = renderGuide([branch, second], 'branch')

    expect(guide.count).toBe(2)
    expect(guide.text).toContain('- At most 60 characters\n\n## Review rubric\n')
  })

  it('should return an empty guide when no standard is enabled for the application', () => {
    const disabled = { ...branch, enabled: false }

    const guide = renderGuide([disabled, review], 'branch')

    expect(guide).toEqual({ text: '', lines: 0, tokens: 0, count: 0 })
  })

  it('should return an empty guide when there is no standard at all', () => {
    const guide = renderGuide([], 'branch')

    expect(guide).toEqual({ text: '', lines: 0, tokens: 0, count: 0 })
  })
})

describe('renderIndex', () => {
  it('should list each enabled standard with its reason and its command when some are enabled', () => {
    const disabled = { ...review, id: 'commit-message', applies: 'commit', enabled: false }

    const index = renderIndex([branch, review, disabled])

    expect(index).toBe(
      [
        'Before an action listed below, run its command and follow what it prints.',
        '',
        '- Branch names: Work is traceable from the branch name. Run `dck guide branch`.',
        '- Review rubric: Reviews stay comparable. Run `dck guide review`.',
      ].join('\n'),
    )
  })

  it('should return an empty string when nothing is enabled', () => {
    const index = renderIndex([{ ...branch, enabled: false }])

    expect(index).toBe('')
  })
})
