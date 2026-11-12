import { RULE_KINDS, type Standard, type StandardRule } from './standard.ts'

// Only the id is required, so a minimal override (an id and the one field it changes) can be written
export type StandardDraft = Pick<Standard, 'id'> & Partial<Standard>

// YAML single quotes take a backslash literally, which keeps a regular expression readable
const quote = (text: string) => (/['\r\n]/.test(text) ? JSON.stringify(text) : `'${text}'`)

function field(name: string, value: string | number | boolean | readonly string[] | undefined) {
  if (value === undefined) return []
  if (typeof value === 'string') return [`${name}: ${quote(value)}`]
  if (typeof value !== 'object') return [`${name}: ${value}`]
  if (value.length === 0) return [`${name}: []`]
  return [`${name}:`, ...value.map((item) => `  - ${quote(item)}`)]
}

function ruleLines(rule: StandardRule): string[] {
  const variables = Object.entries(rule.variables ?? {})
  const fields = [
    ...RULE_KINDS.flatMap((kind) => field(kind, rule[kind])),
    ...(variables.length > 0 ? ['variables:'] : []),
    ...variables.map(([name, value]) => `  ${name}: ${quote(value)}`),
    ...field('scope', rule.scope),
    ...field('message', rule.message),
  ]
  return fields.map((line, index) => `${index === 0 ? '  - ' : '    '}${line}`)
}

function checkLines(check: readonly StandardRule[] | undefined): string[] {
  if (check === undefined) return []
  return check.length === 0 ? ['check: []'] : ['check:', ...check.flatMap(ruleLines)]
}

// The markdown text of a standard file, with the fields always in the same order
export function formatStandardFile(standard: StandardDraft): string {
  const lines = [
    '---',
    ...field('id', standard.id),
    ...field('title', standard.title),
    ...field('applies', standard.applies),
    ...field('paths', standard.paths),
    ...field('why', standard.why),
    ...field('enabled', standard.enabled),
    ...checkLines(standard.check),
    '---',
  ]
  const body = (standard.body ?? '').trim()
  return `${lines.join('\n')}\n${body === '' ? '' : `${body}\n`}`
}
