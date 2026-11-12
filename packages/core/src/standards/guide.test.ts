import { describe, expect, it } from 'vitest'
import { LONG_BODY_LINES, renderBlock, renderGuide } from './guide.ts'
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

describe('renderBlock', () => {
  it('should state the rule messages of each enabled standard when it has rules', () => {
    const disabled = { ...review, id: 'commit-message', applies: 'commit', enabled: false }

    const block = renderBlock([branch, disabled])

    expect(block).toBe(
      [
        '## Standards to follow in this repository',
        '',
        '- Branch names: Start with feat/ or fix/; At most 60 characters',
      ].join('\n'),
    )
  })

  it('should state the reason and point to the guide command when a standard has no rule and a short body', () => {
    const block = renderBlock([review])

    expect(block.split('\n').slice(2)).toEqual([
      '- Review rubric: Reviews stay comparable.',
      '  Details: `dck guide review`',
    ])
  })

  it('should state only the reason when a standard has no rule and no body', () => {
    const block = renderBlock([{ ...review, body: '' }])

    expect(block).not.toContain('Details:')
  })

  it('should point to the guide command only when the body of a standard with rules is longer than the limit', () => {
    const body = (lines: number) => Array.from({ length: lines }, () => 'A line.').join('\n')
    const short = { ...branch, body: body(LONG_BODY_LINES) }
    const long = { ...review, body: body(LONG_BODY_LINES + 1) }

    const block = renderBlock([short, long])

    expect(block.split('\n').slice(2)).toEqual([
      '- Branch names: Start with feat/ or fix/; At most 60 characters',
      '- Review rubric: Reviews stay comparable.',
      '  Details: `dck guide review`',
    ])
  })

  it('should return an empty string when nothing is enabled', () => {
    const block = renderBlock([{ ...branch, enabled: false }])

    expect(block).toBe('')
  })
})
