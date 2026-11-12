import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import { checkMessage, compileCheck } from './compile.ts'
import { type Check, checkSchema, type Rule } from './rule.ts'

// What a screen edits in a check without showing its expression: each variable and the length limit
export interface RuleField {
  // The index of the check in `check`
  readonly check: number
  readonly name: string
  readonly kind: 'text' | 'number'
  readonly value: string | number
  // The check message, which explains the field
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

export function ruleFields(rule: Pick<Rule, 'check'>): RuleField[] {
  return rule.check.flatMap((check, index) => {
    const common = { check: index, message: checkMessage(check) }
    const fields: RuleField[] = Object.entries(check.variables ?? {}).map(([name, value]) => ({
      ...common,
      name,
      kind: 'text',
      value,
    }))
    if (check.maxLength !== undefined) {
      fields.push({ ...common, name: MAX_LENGTH, kind: 'number', value: check.maxLength })
    }
    return fields
  })
}

// A new `check` list with one field changed, refused when the changed check would not load
export function withRuleField(
  checks: readonly Check[],
  index: number,
  name: string,
  value: string | number,
): Result<Check[], ErrorBody> {
  const where = `check.${index}`
  const invalid = (reason: string) => fail(errorBody('DCK-RUL-001', `${where}.${name}: ${reason}`))
  const current = checks[index]
  if (current === undefined) return fail(errorBody('DCK-RUL-001', `${where}: no such check`))
  const isLimit = name === MAX_LENGTH && current.maxLength !== undefined
  if (!isLimit && !Object.hasOwn(current.variables ?? {}, name)) return invalid('no such field')

  // A list of names may be typed with commas or spaces, the way the window shows it
  const previous = current.variables?.[name]
  const typed =
    typeof value === 'string' && previous !== undefined && isNameList(previous)
      ? listValue(value)
      : value
  // The schema refuses a wrong type or an out of range value, the compilation a broken expression
  const parsed = checkSchema.safeParse(
    isLimit
      ? { ...current, maxLength: value }
      : { ...current, variables: { ...current.variables, [name]: typed } },
  )
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'invalid')
  const compiled = compileCheck(parsed.data, where)
  if (!compiled.ok) return compiled
  return ok(checks.with(index, parsed.data))
}
