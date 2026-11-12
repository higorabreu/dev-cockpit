import type { ResolvedStandard } from './resolve.ts'
import type { CompiledRule } from './rules.ts'
import { enabledFor, type RuleKind } from './standard.ts'

// Together with the expression length limit, this bounds what a slow user expression can cost
export const CHECK_TEXT_MAX = 20000

export type MatchResult = 'match' | 'no-match' | 'timeout'
// Injected so a caller can run the expression with a time limit
export type Matcher = (expression: RegExp, text: string) => MatchResult

export interface CheckOptions {
  readonly match?: Matcher
  // For a caller that only holds the first line (a commit subject): the rules over the whole text are skipped
  readonly firstLineOnly?: boolean
}

export interface CheckFailure {
  readonly standard: string
  readonly title: string
  readonly kind: RuleKind | 'timeout'
  readonly message: string
}

const plainMatch: Matcher = (expression, text) => (expression.test(text) ? 'match' : 'no-match')

function outcome(rule: CompiledRule, text: string, match: Matcher): 'pass' | 'fail' | 'timeout' {
  if (rule.kind === 'maxLength') return text.length <= rule.max ? 'pass' : 'fail'
  const result = match(rule.expression, text)
  if (result === 'timeout') return 'timeout'
  return (result === 'match') === (rule.kind !== 'forbid') ? 'pass' : 'fail'
}

// An empty list means the text passes every enabled standard of the application
export function checkText(
  standards: readonly ResolvedStandard[],
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
  const applies = (rule: CompiledRule) => !options.firstLineOnly || rule.scope === 'first-line'
  return enabledFor(standards, application).flatMap((standard) =>
    standard.rules.filter(applies).flatMap((rule) => {
      const result = outcome(rule, rule.scope === 'first-line' ? firstLine : checked, match)
      if (result === 'pass') return []
      const kind = result === 'timeout' ? result : rule.kind
      return [{ standard: standard.id, title: standard.title, kind, message: rule.message }]
    }),
  )
}
