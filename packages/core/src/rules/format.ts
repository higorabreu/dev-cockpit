import { CHECK_KINDS, type Check, type Rule } from './rule.ts'

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

function checkLines(check: Check): string[] {
  const variables = Object.entries(check.variables ?? {})
  const fields = [
    ...CHECK_KINDS.flatMap((kind) => field(kind, check[kind])),
    ...(variables.length > 0 ? ['variables:'] : []),
    ...variables.map(([name, value]) => `  ${key(name)}: ${quote(value)}`),
    ...field('scope', check.scope),
    ...field('message', check.message),
  ]
  return fields.map((line, index) => `${index === 0 ? '  - ' : '    '}${line}`)
}

function checkListLines(check: readonly Check[]): string[] {
  return check.length === 0 ? ['check: []'] : ['check:', ...check.flatMap(checkLines)]
}

// The markdown text of a rule file, with the fields always in the same order
export function formatRuleFile(rule: Rule): string {
  const lines = [
    '---',
    ...field('id', rule.id),
    ...field('title', rule.title),
    ...field('applies', rule.applies),
    ...field('paths', rule.paths),
    ...field('why', rule.why),
    ...field('enabled', rule.enabled),
    ...checkListLines(rule.check),
    '---',
  ]
  const body = rule.body.trim()
  return `${lines.join('\n')}\n${body === '' ? '' : `${body}\n`}`
}

// The reverse of the layout above: the YAML between a first `---` line and the next one, then the body
export function splitRuleFile(text: string): { yaml: string | undefined; body: string } {
  // Editors on Windows save a byte order mark and CRLF line endings
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const isFence = (line: string | undefined) => line?.trimEnd() === '---'
  const end = isFence(lines[0]) ? lines.findIndex((line, index) => index > 0 && isFence(line)) : -1
  if (end === -1) return { yaml: undefined, body: lines.join('\n') }
  return { yaml: lines.slice(1, end).join('\n'), body: lines.slice(end + 1).join('\n') }
}
