// @vitest-environment happy-dom
import {
  createTranslator,
  errorBody,
  fail,
  type HostApi,
  type Locale,
  ok,
  type RulesChange,
  type RulesView,
  type RuleView,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createHarnessPage } from './harness-page.ts'

const ROOT = '/home/ana/acme/backend'

const branchFormat: RuleView = {
  id: 'branch-format',
  title: 'Branch names',
  applies: 'branch',
  why: 'The kind of work shows in the branch list',
  enabled: false,
  source: 'built-in',
  fields: [
    { check: 0, name: 'main', kind: 'text', value: 'main|develop', message: 'Use <type>/<slug>' },
    { check: 0, name: 'types', kind: 'text', value: 'feat|fix', message: 'Use <type>/<slug>' },
  ],
}

const commitMessage: RuleView = {
  id: 'commit-message',
  title: 'Commit messages',
  applies: 'commit',
  why: 'The history reads as a changelog',
  enabled: true,
  source: 'repository',
  fields: [
    { check: 0, name: 'types', kind: 'text', value: 'feat|fix', message: 'Start with <type>:' },
    { check: 1, name: 'maxLength', kind: 'number', value: 72, message: 'Within 72 characters' },
  ],
}

const viewOf = (overrides: Partial<RulesView> = {}): RulesView => ({
  root: ROOT,
  rules: [branchFormat, commitMessage],
  invalid: [],
  agents: { file: `${ROOT}/AGENTS.md`, shared: false, stale: false, claudeImportMissing: false },
  ...overrides,
})

const withAgents = (agents: Partial<RulesView['agents']>) =>
  viewOf({ agents: { ...viewOf().agents, ...agents } })

// A host in memory: it applies a change to its view, or refuses it
async function open(initial: RulesView | undefined, locale: Locale = 'en') {
  let view = initial
  let refusal: RulesChange | undefined
  const calls: unknown[][] = []
  const change = (call: unknown[], apply: (current: RulesView) => RulesView) => {
    calls.push(call)
    if (refusal) return Promise.resolve(refusal)
    if (!view) return Promise.resolve(fail(errorBody('DCK-RUL-003')))
    view = apply(view)
    return Promise.resolve(ok(view))
  }
  const api: HostApi['rules'] = {
    get: async () => view,
    setEnabled: (ptyId, id, enabled) =>
      change(['setEnabled', ptyId, id, enabled], (current) => ({
        ...current,
        rules: current.rules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
      })),
    setField: (ptyId, id, check, name, value) =>
      change(['setField', ptyId, id, check, name, value], (current) => ({
        ...current,
        rules: current.rules.map((rule) =>
          rule.id === id
            ? {
                ...rule,
                fields: rule.fields.map((field) =>
                  field.check === check && field.name === name ? { ...field, value } : field,
                ),
              }
            : rule,
        ),
      })),
    shareWithAgents: (ptyId, on) =>
      change(['shareWithAgents', ptyId, on], (current) => ({
        ...current,
        agents: { ...current.agents, shared: on, stale: false },
      })),
    addClaudeImport: (ptyId) =>
      change(['addClaudeImport', ptyId], (current) => ({
        ...current,
        agents: { ...current.agents, claudeImportMissing: false },
      })),
  }

  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const page = createHarnessPage({
    api,
    i18n: createTranslator(locale),
    ptyId: () => 7,
    // Redraws like the settings screen does: everything again, with the focus put back
    requestRender() {
      const focused = document.activeElement?.getAttribute('data-focus')
      host.replaceChildren(...page.render())
      if (focused) host.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus()
    },
  })
  await page.refresh()

  const control = <T extends HTMLElement = HTMLInputElement>(key: string) =>
    host.querySelector<T>(`[data-focus="${key}"]`)
  // Lets the answer of the host arrive and the page redraw
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  return {
    host,
    calls,
    control,
    texts: (selector: string) =>
      [...host.querySelectorAll(selector)].map((element) => element.textContent),
    // The host answers this to every change until it is told to accept again
    refuseWith(result: RulesChange | undefined) {
      refusal = result
    },
    async toggle(key: string) {
      control(key)?.click()
      await settle()
    },
    async type(key: string, value: string) {
      const input = control(key)
      if (input) input.value = value
      input?.dispatchEvent(new Event('change'))
      await settle()
    },
    async press(key: string) {
      control<HTMLButtonElement>(key)?.click()
      await settle()
    },
  }
}

describe('createHarnessPage rows', () => {
  it('should show the repository and one row per rule with its reason when the page opens', async () => {
    const { host, texts, control } = await open(viewOf())

    expect(host.querySelector('.spath')?.textContent).toBe('~/acme/backend')
    expect(texts('label.sname2')).toEqual(
      expect.arrayContaining(['Branch names', 'Commit messages']),
    )
    expect(host.textContent).toContain('The kind of work shows in the branch list')
    expect(control('rule-branch-format')?.checked).toBe(false)
    expect(control('rule-commit-message')?.checked).toBe(true)
  })

  it('should show the fields only under an enabled rule, with the check message once per check', async () => {
    const { texts, control } = await open(viewOf())

    expect(texts('.sfield label')).toEqual(['types', 'Maximum length'])
    expect(texts('.scheck')).toEqual(['Start with <type>:', 'Within 72 characters'])
    expect(control('rule-commit-message-0-types')?.type).toBe('text')
    expect(control('rule-commit-message-0-types')?.value).toBe('feat, fix')
    expect(control('rule-commit-message-1-maxLength')?.type).toBe('number')
    expect(control('rule-commit-message-1-maxLength')?.value).toBe('72')
    expect(control('rule-branch-format-0-types')).toBeNull()
  })

  it('should say the check message once when two fields belong to the same check', async () => {
    const { texts, toggle } = await open(viewOf({ rules: [branchFormat] }))

    await toggle('rule-branch-format')

    expect(texts('.sfield label')).toEqual(['main', 'types'])
    expect(texts('.scheck')).toEqual(['Use <type>/<slug>'])
  })

  it('should tie every label and description to its control when the rows are drawn', async () => {
    const { host, control } = await open(viewOf())

    const labelled = [...host.querySelectorAll('label')].map((label) => label.getAttribute('for'))
    const inputs = [...host.querySelectorAll('input')]

    expect(labelled).toEqual(inputs.map((input) => input.id))
    for (const input of inputs) {
      const described = input.getAttribute('aria-describedby') ?? ''
      expect(host.querySelector(`[id="${described}"]`), described).not.toBeNull()
    }
    expect(control('rule-commit-message-1-maxLength')?.getAttribute('aria-describedby')).toBe(
      'rule-commit-message-1',
    )
  })

  it('should show one sentence and nothing else when the tab is not inside a repository', async () => {
    const { host } = await open(undefined)

    expect(host.textContent).toBe('The active tab is not inside a git repository.')
    expect(host.querySelectorAll('input, button')).toHaveLength(0)
  })

  it('should say that no rule was found when the repository has none', async () => {
    const { host } = await open(viewOf({ rules: [] }))

    expect(host.textContent).toContain('No rule found.')
  })

  it('should list the invalid files with what is wrong only when there are any', async () => {
    const clean = await open(viewOf())
    const cleanText = clean.host.textContent
    const broken = await open(
      viewOf({
        invalid: [
          { path: `${ROOT}/.dck/rules/broken.md`, message: 'why: required' },
          { path: '/home/ana/.config/dev-cockpit/rules/old.md', message: 'id: required' },
        ],
      }),
    )

    expect(cleanText).not.toContain('Invalid files')
    expect(broken.host.textContent).toContain('Invalid files')
    expect(broken.texts('.slabel .spath')).toEqual([
      '.dck/rules/broken.md',
      '~/.config/dev-cockpit/rules/old.md',
    ])
    expect(broken.host.textContent).toContain('why: required')
  })

  it.each([
    ['en', ['Repository', 'Harness', 'Agents', 'Share with agents']],
    ['pt-BR', ['Repositório', 'Harness', 'Agentes', 'Compartilhar com agentes']],
  ] as const)(
    'should write its texts in %s when that is the language',
    async (locale, expected) => {
      const { host } = await open(viewOf(), locale)

      for (const text of expected) expect(host.textContent).toContain(text)
    },
  )

  it.each([
    ['en', "The rules of this repository that guide and check the work, yours and your agents'."],
    ['pt-BR', 'As regras deste repositório que orientam e conferem o trabalho, seu e dos agentes.'],
  ] as const)(
    'should explain the area under its title when the language is %s',
    async (locale, line) => {
      const { host } = await open(viewOf(), locale)

      const titles = [...host.querySelectorAll('h2')]
      const harness = titles.find((title) => title.textContent === 'Harness')
      expect(harness?.nextElementSibling?.textContent).toBe(line)
      expect(harness?.nextElementSibling?.classList.contains('shint')).toBe(true)
    },
  )
})

describe('createHarnessPage changes', () => {
  it('should switch the rule through the host and show its fields when its box is checked', async () => {
    const { calls, toggle, control } = await open(viewOf())

    await toggle('rule-branch-format')

    expect(calls).toEqual([['setEnabled', 7, 'branch-format', true]])
    expect(control('rule-branch-format')?.checked).toBe(true)
    expect(control('rule-branch-format-0-types')?.value).toBe('feat, fix')
  })

  it('should say why and leave the box as it was when the switch fails', async () => {
    const { host, toggle, control, refuseWith } = await open(viewOf())
    refuseWith(fail(errorBody('DCK-RUL-002', 'EACCES: permission denied')))

    await toggle('rule-branch-format')

    expect(control('rule-branch-format')?.checked).toBe(false)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not write the file: EACCES: permission denied',
    )
  })

  it('should save a list of names typed with commas and a number when their inputs change', async () => {
    const { calls, type, control } = await open(viewOf())

    await type('rule-commit-message-0-types', ' feat, fix docs ')
    await type('rule-commit-message-1-maxLength', '50')

    expect(calls).toEqual([
      ['setField', 7, 'commit-message', 0, 'types', 'feat|fix|docs'],
      ['setField', 7, 'commit-message', 1, 'maxLength', 50],
    ])
    expect(control('rule-commit-message-0-types')?.value).toBe('feat, fix, docs')
    expect(control('rule-commit-message-1-maxLength')?.value).toBe('50')
  })

  it('should show the failure under the input and keep what was typed when the value is refused', async () => {
    const { host, type, control, refuseWith } = await open(viewOf())
    refuseWith(fail(errorBody('DCK-RUL-001', 'check.0.pattern: Unterminated group')))

    await type('rule-commit-message-0-types', 'feat|fix(')

    const input = control('rule-commit-message-0-types')
    const alert = host.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe(
      'This value does not work in the rule. The previous one was kept.',
    )
    expect(alert?.className).toContain('serror')
    expect(input?.closest('.srow2')?.nextElementSibling).toBe(alert)
    expect(input?.value).toBe('feat|fix(')
    expect(input?.getAttribute('aria-invalid')).toBe('true')
  })

  it('should clear the failure when the corrected value is accepted', async () => {
    const { host, type, refuseWith } = await open(viewOf())
    refuseWith(fail(errorBody('DCK-RUL-001', 'check.0.pattern: Unterminated group')))
    await type('rule-commit-message-0-types', 'feat|fix(')
    refuseWith(undefined)

    await type('rule-commit-message-0-types', 'feat|fix')

    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('should write the failure in the chosen language when a change is refused', async () => {
    const { host, toggle, refuseWith } = await open(viewOf(), 'pt-BR')
    refuseWith(fail(errorBody('DCK-RUL-003')))

    await toggle('rule-branch-format')

    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Fora de um repositório git')
  })
})

describe('createHarnessPage agents', () => {
  it('should ask in place and write nothing when sharing is switched on', async () => {
    const { host, calls, toggle, control } = await open(viewOf())

    await toggle('harness-share')

    const confirm = control<HTMLButtonElement>('harness-share-confirm')
    expect(calls).toEqual([])
    expect(confirm?.textContent).toBe('Confirm')
    expect(control('harness-share')?.checked).toBe(false)
    expect(document.activeElement).toBe(confirm)
    expect(host.textContent).toContain('This writes a block into AGENTS.md of this repository.')
  })

  it('should share and return to the box when the confirmation is pressed', async () => {
    const { calls, toggle, press, control } = await open(viewOf())
    await toggle('harness-share')

    await press('harness-share-confirm')

    expect(calls).toEqual([['shareWithAgents', 7, true]])
    expect(control('harness-share')?.checked).toBe(true)
    expect(control('harness-share-confirm')).toBeNull()
    expect(document.activeElement).toBe(control('harness-share'))
  })

  it('should write nothing when the box is clicked again instead of confirming', async () => {
    const { calls, toggle, control } = await open(viewOf())
    await toggle('harness-share')

    await toggle('harness-share')

    expect(calls).toEqual([])
    expect(control('harness-share')?.checked).toBe(false)
    expect(control('harness-share-confirm')).toBeNull()
  })

  it('should stop sharing without asking again when the box is unchecked', async () => {
    const { calls, toggle, control } = await open(withAgents({ shared: true }))

    await toggle('harness-share')

    expect(calls).toEqual([['shareWithAgents', 7, false]])
    expect(control('harness-share')?.checked).toBe(false)
  })

  it('should offer to update the block and write it again when it is out of date', async () => {
    const { host, calls, press, control } = await open(withAgents({ shared: true, stale: true }))
    const before = host.textContent

    await press('harness-update')

    expect(before).toContain('The block in AGENTS.md is out of date')
    expect(calls).toEqual([['shareWithAgents', 7, true]])
    expect(control('harness-update')).toBeNull()
    expect(document.activeElement).toBe(control('harness-share'))
  })

  it('should offer to add the import and add it when CLAUDE.md does not import the shared block', async () => {
    const { host, calls, press, control } = await open(
      withAgents({ shared: true, claudeImportMissing: true }),
    )
    const before = host.textContent

    await press('harness-claude-import')

    expect(before).toContain('CLAUDE.md does not import AGENTS.md')
    expect(control('harness-claude-import')).toBeNull()
    expect(calls).toEqual([['addClaudeImport', 7]])
  })

  it('should not mention CLAUDE.md when nothing is shared', async () => {
    const { control } = await open(withAgents({ claudeImportMissing: true }))

    expect(control('harness-claude-import')).toBeNull()
  })

  it('should show no notice when the block is shared and up to date', async () => {
    const { control } = await open(withAgents({ shared: true }))

    expect(control('harness-update')).toBeNull()
    expect(control('harness-claude-import')).toBeNull()
  })
})
