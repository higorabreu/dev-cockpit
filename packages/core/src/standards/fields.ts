import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import { compileRule, ruleMessage } from './rules.ts'
import { ruleSchema, type Standard, type StandardRule } from './standard.ts'

// What a screen edits in a rule without showing its expression: each variable and the length limit
export interface RuleField {
  // The index of the rule in `check`
  readonly rule: number
  readonly name: string
  readonly kind: 'text' | 'number'
  readonly value: string | number
  // The rule message, which explains the field
  readonly message: string
}

export const MAX_LENGTH_FIELD = 'maxLength'
const MAX_LENGTH = MAX_LENGTH_FIELD

// A value that is only names joined by "|" is shown and typed as a list, not as an expression
const NAMES = /^[\w-]+(\|[\w-]+)*$/
export const isNameList = (value: string | number): value is string =>
  typeof value === 'string' && NAMES.test(value)
export const listText = (value: string): string => value.split('|').join(', ')
export const listValue = (text: string): string =>
  text
    .split(/[\s,|]+/)
    .filter((name) => name !== '')
    .join('|')

export function ruleFields(standard: Pick<Standard, 'check'>): RuleField[] {
  return standard.check.flatMap((rule, index) => {
    const common = { rule: index, message: ruleMessage(rule) }
    const fields: RuleField[] = Object.entries(rule.variables ?? {}).map(([name, value]) => ({
      ...common,
      name,
      kind: 'text',
      value,
    }))
    if (rule.maxLength !== undefined) {
      fields.push({ ...common, name: MAX_LENGTH, kind: 'number', value: rule.maxLength })
    }
    return fields
  })
}

// A new `check` list with one field changed, refused when the changed rule would not load
export function withRuleField(
  check: readonly StandardRule[],
  rule: number,
  name: string,
  value: string | number,
): Result<StandardRule[], ErrorBody> {
  const where = `check.${rule}`
  const invalid = (reason: string) => fail(errorBody('DCK-STD-001', `${where}.${name}: ${reason}`))
  const current = check[rule]
  if (current === undefined) return fail(errorBody('DCK-STD-001', `${where}: no such rule`))
  const isLimit = name === MAX_LENGTH && current.maxLength !== undefined
  if (!isLimit && !Object.hasOwn(current.variables ?? {}, name)) return invalid('no such field')

  // A list of names may be typed with commas or spaces, the way the window shows it
  const previous = current.variables?.[name]
  const typed =
    typeof value === 'string' && previous !== undefined && isNameList(previous)
      ? listValue(value)
      : value
  // The schema refuses a wrong type or an out of range value, the compilation a broken expression
  const parsed = ruleSchema.safeParse(
    isLimit
      ? { ...current, maxLength: value }
      : { ...current, variables: { ...current.variables, [name]: typed } },
  )
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'invalid')
  const compiled = compileRule(parsed.data, where)
  if (!compiled.ok) return compiled
  return ok(check.with(rule, parsed.data))
}
