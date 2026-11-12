import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import { type Check, ONE_CHECK_KIND } from './rule.ts'

interface CheckCommon {
  readonly message: string
  readonly scope: 'text' | 'first-line'
}

export type CompiledCheck =
  | (CheckCommon & {
      readonly kind: 'pattern' | 'required' | 'forbid'
      readonly expression: RegExp
    })
  | (CheckCommon & { readonly kind: 'maxLength'; readonly max: number })

const EXPRESSION_KINDS = ['pattern', 'required', 'forbid'] as const

// A name starts with a letter, so a quantifier like {1,72} is left alone
const VARIABLE = /\{([A-Za-z][A-Za-z0-9]*)\}/g

// A list of alternatives reads better as "feat, fix" than as "feat|fix"
const ALTERNATIVES = /^[\w-]+(\|[\w-]+)+$/

// A message may name the check's own fields, so it stays true after one of them is edited
export function checkMessage(check: Check): string {
  const fields: Record<string, string | number | undefined> = {
    ...check.variables,
    maxLength: check.maxLength,
  }
  return check.message.replace(VARIABLE, (whole, name: string) => {
    const value = Object.hasOwn(fields, name) ? fields[name] : undefined
    if (value === undefined) return whole
    const text = String(value)
    return ALTERNATIVES.test(text) ? text.replaceAll('|', ', ') : text
  })
}

// `where` is the file and check the failure detail points to
export function compileCheck(check: Check, where: string): Result<CompiledCheck, ErrorBody> {
  const common = { message: checkMessage(check), scope: check.scope ?? 'text' }
  if (check.maxLength !== undefined)
    return ok({ ...common, kind: 'maxLength', max: check.maxLength })

  const kind = EXPRESSION_KINDS.find((candidate) => check[candidate] !== undefined)
  const source = kind && check[kind]
  if (kind === undefined || source === undefined) {
    return fail(errorBody('DCK-RUL-001', `${where}: ${ONE_CHECK_KIND}`))
  }
  const variables = check.variables ?? {}
  const unknown: string[] = []
  const expanded = source.replace(VARIABLE, (whole, name: string) => {
    if (Object.hasOwn(variables, name)) return `(?:${variables[name]})`
    unknown.push(name)
    return whole
  })
  if (unknown.length > 0) {
    return fail(errorBody('DCK-RUL-001', `${where}.${kind}: unknown variable {${unknown[0]}}`))
  }
  try {
    return ok({ ...common, kind, expression: new RegExp(expanded) })
  } catch (error) {
    return fail(errorBody('DCK-RUL-001', `${where}.${kind}: ${String(error)}`))
  }
}
