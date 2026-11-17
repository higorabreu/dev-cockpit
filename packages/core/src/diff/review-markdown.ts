import type { Translator } from '../i18n/translator.ts'
import { commentSpan, isOutdated, type ReviewComment } from './comments.ts'
import type { DiffLine } from './diff.ts'

// A comment quotes at most this many of its lines; past it a note says how many were left out
export const QUOTED_LINES = 40
const SIGN = { context: ' ', add: '+', remove: '-' } as const

type Words = Pick<Translator, 't' | 'plural'>

// A fence longer than any run of backticks in the code, so the code can never close it; three at least
export function codeFence(lines: readonly string[]): string {
  let longest = 0
  for (const line of lines) {
    for (const run of line.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  }
  return '`'.repeat(Math.max(3, longest + 1))
}

// "Lines 9-10", "Removed line 10", and the outdated mark when the lines changed after the comment
function heading(comment: ReviewComment, words: Words): string {
  const { from, to, removed } = commentSpan(comment.lines)
  const named =
    from === to
      ? words.t(removed ? 'review.lines.removedOne' : 'review.lines.one', { line: from })
      : words.t(removed ? 'review.lines.removedRange' : 'review.lines.range', { from, to })
  return isOutdated(comment) ? words.t('review.notes.outdated', { lines: named }) : named
}

function quote(lines: readonly DiffLine[], words: Words): string[] {
  const shown = lines.slice(0, QUOTED_LINES).map((line) => SIGN[line.kind] + line.text)
  const fence = codeFence(shown)
  const left = lines.length - shown.length
  return [
    `${fence}diff`,
    ...shown,
    fence,
    ...(left > 0 ? ['', words.plural('review.notes.more', left)] : []),
  ]
}

const firstOf = (comment: ReviewComment) => commentSpan(comment.lines).from

// Every pending comment as a Markdown file for the agent: a title, how many comments on how many files
// and which numbers they use, then one section per file by path and one per comment by line, each with
// its lines quoted as a diff and the comment as written
export function reviewMarkdown(comments: readonly ReviewComment[], words: Words): string {
  const paths = [...new Set(comments.map((comment) => comment.path))].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  const summary = words.t('review.notes.summary', {
    comments: words.plural('review.comments', comments.length),
    files: words.plural('review.files', paths.length),
  })
  const out = [`# ${words.t('review.notes.title')}`, '', summary]
  for (const path of paths) {
    out.push('', `## ${path}`)
    const ofPath = comments
      .filter((comment) => comment.path === path)
      .sort((a, b) => firstOf(a) - firstOf(b))
    for (const comment of ofPath) {
      out.push('', `### ${heading(comment, words)}`, '', ...quote(comment.lines, words))
      out.push('', comment.body.trim())
    }
  }
  return `${out.join('\n')}\n`
}
