import { RULE_KINDS, type Standard, type StandardRule } from './standard.ts'

// Only the id is required, so a minimal override (an id and the one field it changes) can be written
export type StandardDraft = Pick<Standard, 'id'> & Partial<Standard>

// YAML single quotes take a backslash literally, which keeps a regular expression readable
const quote = (text: string) => (/['\r\n]/.test(text) ? JSON.stringify(text) : `'${text}'`)

// YAML reads a bare null, true or false key as that value, not as the name of a variable
const key = (name: string) => (/^(null|true|false)$/i.test(name) ? quote(name) : name)

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
    ...variables.map(([name, value]) => `  ${key(name)}: ${quote(value)}`),
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

// The reverse of the layout above: the YAML between a first `---` line and the next one, then the body
export function splitStandardFile(text: string): { yaml: string | undefined; body: string } {
  // Editors on Windows save a byte order mark and CRLF line endings
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const isFence = (line: string | undefined) => line?.trimEnd() === '---'
  const end = isFence(lines[0]) ? lines.findIndex((line, index) => index > 0 && isFence(line)) : -1
  if (end === -1) return { yaml: undefined, body: lines.join('\n') }
  return { yaml: lines.slice(1, end).join('\n'), body: lines.slice(end + 1).join('\n') }
}
