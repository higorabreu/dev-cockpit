import { commentSpan, isOutdated, type ReviewComment, spanText } from './comments.ts'

// Up to this many lines a comment quotes its code, so the agent reads what it points at
export const QUOTED_LINES = 3
const QUOTE_WIDTH = 120
const SIGN = { context: ' ', add: '+', remove: '-' } as const

// A tab would complete a word in a shell without bracketed paste, and a control character could end the
// paste early (ESC [201~) or press a key; neither belongs in typed text
function clean(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
  return text.replace(/\t/g, '    ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
}

function cut(text: string): string {
  const chars = [...text]
  return chars.length <= QUOTE_WIDTH ? text : `${chars.slice(0, QUOTE_WIDTH - 1).join('')}…`
}

// `path:lines[ (removed)][ (outdated)]: comment`, its other lines indented, then the quoted code
export function commentText(comment: ReviewComment): string[] {
  const span = commentSpan(comment.lines)
  const marks = `${span.removed ? ' (removed)' : ''}${isOutdated(comment) ? ' (outdated)' : ''}`
  const [first = '', ...rest] = comment.body
    .split(/\r?\n/)
    .map((line) => clean(line).trimEnd())
    .filter((line) => line.trim() !== '')
  const quote =
    comment.lines.length > QUOTED_LINES
      ? []
      : comment.lines.map((line) => `  > ${SIGN[line.kind]}${cut(clean(line.text).trimEnd())}`)
  return [
    `${clean(comment.path)}:${spanText(span)}${marks}: ${first.trim()}`,
    ...rest.map((line) => `  ${line}`),
    ...quote,
  ]
}

const firstOf = (comment: ReviewComment) => commentSpan(comment.lines).from

// Every pending comment as the text typed at the agent's prompt: by path, then line, then the order they
// were written in; no final newline, so nothing is sent until the developer presses Enter
export function reviewText(comments: readonly ReviewComment[]): string {
  const ordered = [...comments].sort((a, b) =>
    a.path === b.path ? firstOf(a) - firstOf(b) : a.path < b.path ? -1 : 1,
  )
  return ordered.flatMap(commentText).join('\n')
}
