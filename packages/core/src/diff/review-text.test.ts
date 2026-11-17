import { describe, expect, it } from 'vitest'
import { hunkLines, type ReviewComment } from './comments.ts'
import type { DiffHunk } from './diff.ts'
import { parseUnifiedDiff } from './parse.ts'
import { commentText, reviewText } from './review-text.ts'

const [file] = parseUnifiedDiff(
  [
    'diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts',
    '--- a/src/billing/invoice.ts',
    '+++ b/src/billing/invoice.ts',
    '@@ -10,6 +10,6 @@ export function total(invoice: Invoice) {',
    ' const base = 1',
    '-  retry(3)',
    '+const timeout = 5000',
    '+const limit = 10',
    ' return base',
    ' }',
    '-// done',
    '',
  ].join('\n'),
)

const hunk = (): DiffHunk => {
  const found = file?.hunks[0]
  if (!found) throw new Error('invariant: the fixture has a hunk')
  return found
}

const comment = (
  from: number,
  to: number,
  body: string,
  extra: Partial<ReviewComment> = {},
): ReviewComment => ({
  id: `c${from}`,
  path: 'src/billing/invoice.ts',
  lines: hunkLines(hunk(), from, to),
  body,
  place: { hunk: 0, start: from },
  ...extra,
})

describe('commentText', () => {
  it('should name the new lines and quote short code with its diff sign when the lines were added', () => {
    // Arrange
    const added = comment(2, 3, 'use the constant from config')

    // Act
    const text = commentText(added)

    // Assert
    expect(text).toEqual([
      'src/billing/invoice.ts:11-12: use the constant from config',
      '  > +const timeout = 5000',
      '  > +const limit = 10',
    ])
  })

  it('should name the old line and say removed when only removed lines are commented', () => {
    const removed = comment(1, 1, 'keep the retry, the gateway drops requests')

    expect(commentText(removed)).toEqual([
      'src/billing/invoice.ts:11 (removed): keep the retry, the gateway drops requests',
      '  > -  retry(3)',
    ])
  })

  it('should leave the code out when the comment covers more than three lines', () => {
    const long = comment(0, 4, 'split this')

    expect(commentText(long)).toEqual(['src/billing/invoice.ts:10-13: split this'])
  })

  it('should indent the other lines of a comment and drop its blank ones', () => {
    const several = comment(4, 4, 'two things:\n\n- name it\r\n- test it  ')

    expect(commentText(several)).toEqual([
      'src/billing/invoice.ts:13: two things:',
      '  - name it',
      '  - test it',
      '  >  return base',
    ])
  })

  it('should say outdated after the lines when the comment lost its lines', () => {
    const outdated = comment(2, 2, 'still wrong', { place: undefined })

    expect(commentText(outdated)[0]).toBe('src/billing/invoice.ts:11 (outdated): still wrong')
  })

  it('should drop control characters and turn tabs into spaces when the text carries them', () => {
    const hostile = comment(2, 2, 'ok\u001b[201~ then\u0007\tdone', {
      lines: [{ kind: 'add', text: '\tconst x = 1\u001b[0m', old: undefined, new: 11 }],
    })

    expect(commentText(hostile)).toEqual([
      'src/billing/invoice.ts:11: ok[201~ then    done',
      '  > +    const x = 1[0m',
    ])
  })

  it('should cut a long quoted line at 120 characters when the code is wider', () => {
    const wide = comment(2, 2, 'too long', {
      lines: [{ kind: 'add', text: 'x'.repeat(300), old: undefined, new: 11 }],
    })

    const quote = commentText(wide)[1] ?? ''

    expect(quote).toBe(`  > +${'x'.repeat(119)}…`)
  })
})

describe('reviewText', () => {
  it('should order the comments by path and line and end without a newline when several are pending', () => {
    // Arrange
    const later = comment(3, 3, 'name the limit')
    const earlier = comment(1, 1, 'why?')
    const other = { ...comment(2, 2, 'same here'), id: 'c9', path: 'src/app.ts' }

    // Act
    const text = reviewText([later, earlier, other])

    // Assert
    expect(text).toBe(
      [
        'src/app.ts:11: same here',
        '  > +const timeout = 5000',
        'src/billing/invoice.ts:11 (removed): why?',
        '  > -  retry(3)',
        'src/billing/invoice.ts:12: name the limit',
        '  > +const limit = 10',
      ].join('\n'),
    )
    expect(text.endsWith('\n')).toBe(false)
  })

  it('should keep the order they were written in when two comments start on the same line', () => {
    const first = comment(2, 2, 'first')
    const second = { ...comment(2, 2, 'second'), id: 'c10' }

    const text = reviewText([first, second])

    expect(text.split('\n').filter((line) => !line.startsWith('  '))).toEqual([
      'src/billing/invoice.ts:11: first',
      'src/billing/invoice.ts:11: second',
    ])
  })

  it('should give an empty text when no comment is pending', () => {
    expect(reviewText([])).toBe('')
  })
})
