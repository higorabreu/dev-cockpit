import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import { ONE_RULE_KIND, type StandardRule } from './standard.ts'

interface RuleCommon {
  readonly message: string
  readonly scope: 'text' | 'first-line'
}

export type CompiledRule =
  | (RuleCommon & { readonly kind: 'pattern' | 'required' | 'forbid'; readonly expression: RegExp })
  | (RuleCommon & { readonly kind: 'maxLength'; readonly max: number })

const EXPRESSION_KINDS = ['pattern', 'required', 'forbid'] as const

// A name starts with a letter, so a quantifier like {1,72} is left alone
const VARIABLE = /\{([A-Za-z][A-Za-z0-9]*)\}/g

// `where` is the file and rule the failure detail points to
export function compileRule(rule: StandardRule, where: string): Result<CompiledRule, ErrorBody> {
  const common = { message: rule.message, scope: rule.scope ?? 'text' }
  if (rule.maxLength !== undefined) return ok({ ...common, kind: 'maxLength', max: rule.maxLength })

  const kind = EXPRESSION_KINDS.find((candidate) => rule[candidate] !== undefined)
  const source = kind && rule[kind]
  if (kind === undefined || source === undefined) {
    return fail(errorBody('DCK-STD-001', `${where}: ${ONE_RULE_KIND}`))
  }
  const variables = rule.variables ?? {}
  const unknown: string[] = []
  const expanded = source.replace(VARIABLE, (whole, name: string) => {
    if (Object.hasOwn(variables, name)) return `(?:${variables[name]})`
    unknown.push(name)
    return whole
  })
  if (unknown.length > 0) {
    return fail(errorBody('DCK-STD-001', `${where}.${kind}: unknown variable {${unknown[0]}}`))
  }
  try {
    return ok({ ...common, kind, expression: new RegExp(expanded) })
  } catch (error) {
    return fail(errorBody('DCK-STD-001', `${where}.${kind}: ${String(error)}`))
  }
}
