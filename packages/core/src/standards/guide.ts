import { enabledFor, type Standard } from './standard.ts'

// The text here is written into repository files that agents read, so it is fixed English and not i18n:
// two teammates with different locales must produce the same bytes

export interface Guide {
  readonly text: string
  readonly lines: number
  // Estimated as characters divided by four, with no tokenizer
  readonly tokens: number
  readonly count: number
}

function section(standard: Standard): string {
  const checked = ['Checked automatically:', ...standard.check.map((rule) => `- ${rule.message}`)]
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

const INDEX_INTRO = 'Before an action listed below, run its command and follow what it prints.'

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

// The short block for an AGENTS.md: the guides stay out of the context until the agent asks for one
export function renderIndex(standards: readonly Standard[]): string {
  const enabled = standards.filter((standard) => standard.enabled)
  if (enabled.length === 0) return ''
  const lines = enabled.map(
    ({ title, why, applies }) => `- ${title}: ${sentence(why)} Run \`dck guide ${applies}\`.`,
  )
  return [INDEX_INTRO, '', ...lines].join('\n')
}
