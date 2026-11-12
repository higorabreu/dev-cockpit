import type { CompiledCheck } from './compile.ts'
import type { ResolvedRule } from './resolve.ts'
import { type CheckKind, enabledFor } from './rule.ts'

// Together with the expression length limit, this bounds what a slow user expression can cost
export const CHECK_TEXT_MAX = 20000

export type MatchResult = 'match' | 'no-match' | 'timeout'
// Injected so a caller can run the expression with a time limit
export type Matcher = (expression: RegExp, text: string) => MatchResult

export interface CheckOptions {
  readonly match?: Matcher
  // For a caller that only holds the first line (a commit subject): the checks over the whole text are skipped
  readonly firstLineOnly?: boolean
}

export interface CheckFailure {
  readonly rule: string
  readonly title: string
  readonly kind: CheckKind | 'timeout'
  readonly message: string
}

const plainMatch: Matcher = (expression, text) => (expression.test(text) ? 'match' : 'no-match')

function outcome(check: CompiledCheck, text: string, match: Matcher): 'pass' | 'fail' | 'timeout' {
  if (check.kind === 'maxLength') return text.length <= check.max ? 'pass' : 'fail'
  const result = match(check.expression, text)
  if (result === 'timeout') return 'timeout'
  return (result === 'match') === (check.kind !== 'forbid') ? 'pass' : 'fail'
}

// An empty list means the text passes every enabled rule of the application
export function checkText(
  rules: readonly ResolvedRule[],
  application: string,
  text: string,
  options: CheckOptions = {},
): CheckFailure[] {
  const run = options.match ?? plainMatch
  let timedOut = false
  // After one expression runs out of time the others are not run, so a call costs one time limit at most
  const match: Matcher = (expression, value) => {
    if (timedOut) return 'timeout'
    const result = run(expression, value)
    timedOut = result === 'timeout'
    return result
  }
  // A file or a piped text ends with a line break, which would fail a pattern anchored with $
  const checked = text.replace(/\r?\n$/, '').slice(0, CHECK_TEXT_MAX)
  const firstLine = checked.split(/\r?\n/, 1)[0] ?? ''
  const applies = (check: CompiledCheck) => !options.firstLineOnly || check.scope === 'first-line'
  return enabledFor(rules, application).flatMap((rule) =>
    rule.checks.filter(applies).flatMap((check) => {
      const result = outcome(check, check.scope === 'first-line' ? firstLine : checked, match)
      if (result === 'pass') return []
      const kind = result === 'timeout' ? result : check.kind
      return [{ rule: rule.id, title: rule.title, kind, message: check.message }]
    }),
  )
}
