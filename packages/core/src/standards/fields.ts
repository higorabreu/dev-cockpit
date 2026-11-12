import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import { compileRule } from './rules.ts'
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

const MAX_LENGTH = 'maxLength'

export function ruleFields(standard: Pick<Standard, 'check'>): RuleField[] {
  return standard.check.flatMap((rule, index) => {
    const common = { rule: index, message: rule.message }
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

  // The schema refuses a wrong type or an out of range value, the compilation a broken expression
  const parsed = ruleSchema.safeParse(
    isLimit
      ? { ...current, maxLength: value }
      : { ...current, variables: { ...current.variables, [name]: value } },
  )
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'invalid')
  const compiled = compileRule(parsed.data, where)
  if (!compiled.ok) return compiled
  return ok(check.with(rule, parsed.data))
}
