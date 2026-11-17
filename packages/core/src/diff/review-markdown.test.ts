import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator.ts'
import { hunkLines, type ReviewComment } from './comments.ts'
import type { DiffHunk, DiffLine } from './diff.ts'
import { parseUnifiedDiff } from './parse.ts'
import { codeFence, reviewMarkdown } from './review-markdown.ts'

const [file] = parseUnifiedDiff(
  [
    'diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts',
    '--- a/src/billing/invoice.ts',
    '+++ b/src/billing/invoice.ts',
    '@@ -8,4 +8,4 @@ export function total(invoice: Invoice) {',
    '   const base = 1',
    '-  const timeout = 3000',
    '-  retry(3)',
    '+  const timeout = 5000',
    '+  const limit = 10',
    '   return base',
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

const en = createTranslator('en')

describe('reviewMarkdown', () => {
  it('should write a section per file and per comment with its lines quoted as a diff', () => {
    // Arrange
    const added = comment(3, 4, 'Use the constant from config.')
    const removed = comment(2, 2, 'Keep the retry, the gateway drops requests.')

    // Act
    const markdown = reviewMarkdown([added, removed], en)

    // Assert
    expect(markdown).toBe(
      [
        '# Review comments',
        '',
        "2 comments on 1 file. Line numbers are the working tree's; removed lines use the old file's.",
        '',
        '## src/billing/invoice.ts',
        '',
        '### Lines 9-10',
        '',
        '```diff',
        '+  const timeout = 5000',
        '+  const limit = 10',
        '```',
        '',
        'Use the constant from config.',
        '',
        '### Removed line 10',
        '',
        '```diff',
        '-  retry(3)',
        '```',
        '',
        'Keep the retry, the gateway drops requests.',
        '',
      ].join('\n'),
    )
  })

  it('should sort the files by path and mark a comment outdated when its lines changed', () => {
    const outdated = comment(4, 4, 'Name the limit.', { place: undefined })
    const other = { ...comment(0, 0, 'Why one?'), id: 'c9', path: 'src/app.ts' }

    const markdown = reviewMarkdown([outdated, other], en)

    const headings = markdown.split('\n').filter((line) => line.startsWith('#'))
    expect(headings).toEqual([
      '# Review comments',
      '## src/app.ts',
      '### Line 8',
      '## src/billing/invoice.ts',
      '### Line 10 (outdated: the lines changed after this comment)',
    ])
    expect(markdown).toContain('2 comments on 2 files.')
  })

  it('should quote 40 lines and say how many more there are when a comment covers more', () => {
    const lines: DiffLine[] = Array.from({ length: 43 }, (_, index) => ({
      kind: 'add',
      text: `line ${index + 1}`,
      old: undefined,
      new: index + 1,
    }))

    const markdown = reviewMarkdown([comment(0, 0, 'Split this.', { lines })], en)

    expect(markdown).toContain('+line 40\n```\n\n3 more lines not shown.\n\nSplit this.')
    expect(markdown).not.toContain('+line 41')
  })

  it('should keep the comment as written when it has several lines', () => {
    const markdown = reviewMarkdown([comment(3, 3, 'Two things:\n\n- name it\n- test it  ')], en)

    expect(markdown.endsWith('```\n\nTwo things:\n\n- name it\n- test it\n')).toBe(true)
  })

  it('should write in the interface language when it is Portuguese', () => {
    const markdown = reviewMarkdown([comment(2, 3, 'Ok.')], createTranslator('pt-BR'))

    expect(markdown.split('\n').slice(0, 3)).toEqual([
      '# Comentários da revisão',
      '',
      '1 comentário em 1 arquivo. Os números de linha são os da árvore de trabalho; as linhas removidas usam os do arquivo antigo.',
    ])
    expect(markdown).toContain('### Linha 9')
  })
})

describe('codeFence', () => {
  it('should be three backticks when the code has none', () => {
    expect(codeFence(['const a = 1'])).toBe('```')
  })

  it('should be longer than the longest run of backticks in the code', () => {
    expect(codeFence(['const md = "```js"', 'const t = `x`'])).toBe('````')
    expect(codeFence(['`````'])).toBe('``````')
  })
})
