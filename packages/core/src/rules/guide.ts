import { checkMessage } from './compile.ts'
import { enabledFor, type Rule } from './rule.ts'

// Fixed English, not i18n: these files are shared, so teammates in other locales must write the same bytes

export interface Guide {
  readonly text: string
  readonly lines: number
  // Estimated as characters divided by four, with no tokenizer
  readonly tokens: number
  readonly count: number
}

function section(rule: Rule): string {
  const checked = [
    'Checked automatically:',
    ...rule.check.map((check) => `- ${checkMessage(check)}`),
  ]
  return [
    `## ${rule.title}`,
    rule.body,
    `Why: ${rule.why}`,
    rule.check.length > 0 ? checked.join('\n') : '',
  ]
    .filter((part) => part !== '')
    .join('\n\n')
}

export function renderGuide(rules: readonly Rule[], application: string): Guide {
  const sections = enabledFor(rules, application).map(section)
  const text = sections.join('\n\n')
  return {
    text,
    lines: text === '' ? 0 : text.split('\n').length,
    tokens: Math.ceil(text.length / 4),
    count: sections.length,
  }
}

const BLOCK_HEADING = '## Rules to follow in this repository'

// A rule with checks points to `dck guide` from the block only when its body is longer than this
export const LONG_BODY_LINES = 5

// The block for an AGENTS.md: each check is stated here, so an agent follows it without running anything
export function renderBlock(rules: readonly Rule[]): string {
  const enabled = rules.filter((rule) => rule.enabled)
  if (enabled.length === 0) return ''
  const lines = enabled.flatMap(({ title, why, applies, check, body }) => {
    const stated = check.map(checkMessage).join('; ') || why
    // Without a check the line only gives the reason, so any body is what the agent must read
    const hasDetails =
      check.length === 0 ? body.trim() !== '' : body.split('\n').length > LONG_BODY_LINES
    return [`- ${title}: ${stated}`, ...(hasDetails ? [`  Details: \`dck guide ${applies}\``] : [])]
  })
  return [BLOCK_HEADING, '', ...lines].join('\n')
}
