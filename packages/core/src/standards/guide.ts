import { ruleMessage } from './rules.ts'
import { enabledFor, type Standard } from './standard.ts'

// Fixed English, not i18n: these files are shared, so teammates in other locales must write the same bytes

export interface Guide {
  readonly text: string
  readonly lines: number
  // Estimated as characters divided by four, with no tokenizer
  readonly tokens: number
  readonly count: number
}

function section(standard: Standard): string {
  const checked = [
    'Checked automatically:',
    ...standard.check.map((rule) => `- ${ruleMessage(rule)}`),
  ]
  return [
    `## ${standard.title}`,
    standard.body,
    `Why: ${standard.why}`,
    standard.check.length > 0 ? checked.join('\n') : '',
  ]
    .filter((part) => part !== '')
    .join('\n\n')
}

export function renderGuide(standards: readonly Standard[], application: string): Guide {
  const sections = enabledFor(standards, application).map(section)
  const text = sections.join('\n\n')
  return {
    text,
    lines: text === '' ? 0 : text.split('\n').length,
    tokens: Math.ceil(text.length / 4),
    count: sections.length,
  }
}

const BLOCK_HEADING = '## Standards to follow in this repository'

// A standard with rules points to `dck guide` from the block only when its body is longer than this
export const LONG_BODY_LINES = 5

// The block for an AGENTS.md: each rule is stated here, so an agent follows it without running anything
export function renderBlock(standards: readonly Standard[]): string {
  const enabled = standards.filter((standard) => standard.enabled)
  if (enabled.length === 0) return ''
  const lines = enabled.flatMap(({ title, why, applies, check, body }) => {
    const rule = check.map(ruleMessage).join('; ') || why
    // Without a rule the line only gives the reason, so any body is what the agent must read
    const hasDetails =
      check.length === 0 ? body.trim() !== '' : body.split('\n').length > LONG_BODY_LINES
    return [`- ${title}: ${rule}`, ...(hasDetails ? [`  Details: \`dck guide ${applies}\``] : [])]
  })
  return [BLOCK_HEADING, '', ...lines].join('\n')
}
