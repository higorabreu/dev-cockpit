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
import { createFocusKeeper } from '../kit/focus-keeper.ts'
import { createHarnessPage } from './harness-page.ts'

const ROOT = '/home/ana/acme/backend'

const branchFormat: RuleView = {
  id: 'branch-format',
  title: 'Branch names',
  applies: 'branch',
  why: 'The kind of work shows in the branch list',
  enabled: false,
  source: 'built-in',
  checks: ['Use <type>/<slug>'],
  fields: [
    {
      check: 0,
      name: 'longLived',
      kind: 'text',
      value: 'main|develop',
      message: 'Use <type>/<slug>',
    },
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
  checks: ['Start with <type>:', 'Within 72 characters', 'No trailing period'],
  fields: [
    { check: 0, name: 'types', kind: 'text', value: 'feat|fix', message: 'Start with <type>:' },
    { check: 1, name: 'maxLength', kind: 'number', value: 72, message: 'Within 72 characters' },
  ],
}

const reviewRubric: RuleView = {
  id: 'review-rubric',
  title: 'Review rubric',
  applies: 'review',
  why: 'A fixed order finds behavior problems first',
  enabled: true,
  source: 'repository',
  checks: [],
  fields: [],
}

const ticket: RuleView = {
  id: 'ticket',
  title: 'Ticket',
  applies: 'branch',
  why: 'Work is traceable',
  enabled: true,
  source: 'repository',
  checks: ['Name the ticket'],
  fields: [
    { check: 0, name: 'key', kind: 'text', value: '[A-Z]+-[0-9]+', message: 'Name the ticket' },
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

// A host in memory, one view per tab: it applies a change to the view of that tab, or refuses it
async function open(initial: RulesView | undefined, locale: Locale = 'en') {
  const views = new Map<number, RulesView | undefined>([[7, initial]])
  let activePty = 7
  let refusal: RulesChange | undefined
  const calls: unknown[][] = []
  const change = (call: unknown[], apply: (current: RulesView) => RulesView) => {
    calls.push(call)
    const [, ptyId, root] = call as [string, number, string]
    const view = views.get(ptyId)
    if (refusal) return Promise.resolve(refusal)
    if (!view) return Promise.resolve(fail(errorBody('DCK-RUL-003')))
    if (view.root !== root) return Promise.resolve(fail(errorBody('DCK-RUL-006')))
    const next = apply(view)
    views.set(ptyId, next)
    return Promise.resolve(ok(next))
  }
  const api: HostApi['rules'] = {
    get: async (ptyId) => views.get(ptyId),
    setEnabled: (ptyId, root, id, enabled) =>
      change(['setEnabled', ptyId, root, id, enabled], (current) => ({
        ...current,
        rules: current.rules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
      })),
    setField: (ptyId, root, id, check, name, value) =>
      change(['setField', ptyId, root, id, check, name, value], (current) => ({
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
    shareWithAgents: (ptyId, root, on) =>
      change(['shareWithAgents', ptyId, root, on], (current) => ({
        ...current,
        agents: { ...current.agents, shared: on, stale: false },
      })),
    addClaudeImport: (ptyId, root) =>
      change(['addClaudeImport', ptyId, root], (current) => ({
        ...current,
        agents: { ...current.agents, claudeImportMissing: false },
      })),
  }

  const host = document.createElement('div')
  document.body.replaceChildren(host)
  // Redraws like the settings screen does: everything again, with the focus put back
  const keeper = createFocusKeeper(host)
  const page = createHarnessPage({
    api,
    i18n: createTranslator(locale),
    ptyId: () => activePty,
    requestRender: () => keeper.redraw(() => host.replaceChildren(...page.render())),
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
    // Another tab becomes active, in the repository given, without the page being read again
    switchTab(ptyId: number, view: RulesView | undefined) {
      views.set(ptyId, view)
      activePty = ptyId
    },
    // The tab of the page moves to another repository behind it, as a `cd` does
    moveTab(view: RulesView) {
      views.set(7, view)
    },
    page,
    settle,
    redraw: () => keeper.redraw(() => host.replaceChildren(...page.render())),
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

    expect(texts('label.sname2')).toEqual(
      expect.arrayContaining(['Branch names', 'Commit messages']),
    )
    expect(host.textContent).toContain('The kind of work shows in the branch list')
    expect(control('rule-branch-format')?.checked).toBe(false)
    expect(control('rule-commit-message')?.checked).toBe(true)
  })

  it('should show the folder of the repository, its whole path and where the rules are saved when the page opens', async () => {
    const { host } = await open(viewOf())

    const value = host.querySelector('.scontrol .spath')
    const hints = [...(value?.closest('.srow2')?.querySelectorAll('.shint') ?? [])]
    expect(value?.textContent).toBe('backend')
    expect(hints.map((hint) => hint.textContent)).toEqual([
      '~/acme/backend',
      'Saved in .dck/rules of this repository, to share with the team. The Git section marks what is outside a rule; nothing is blocked.',
    ])
  })

  it('should put the message of a check as the hint of its first field when the rule is enabled', async () => {
    const { texts, control } = await open(viewOf())

    expect(texts('.sfield label')).toEqual(['types', 'Maximum length'])
    expect(texts('.sfield .shint')).toEqual(['Start with <type>:', 'Within 72 characters'])
    expect(control('rule-commit-message-0-types')?.type).toBe('text')
    expect(control('rule-commit-message-0-types')?.value).toBe('feat, fix')
    expect(control('rule-commit-message-1-maxLength')?.type).toBe('number')
    expect(control('rule-commit-message-1-maxLength')?.value).toBe('72')
    expect(control('rule-branch-format-0-types')).toBeNull()
  })

  it('should give a check with no field a line of its own when the rule is enabled', async () => {
    const { texts } = await open(viewOf())

    expect(texts('.scheck')).toEqual(['No trailing period'])
  })

  it('should say the rule only guides agents when it has no check', async () => {
    const { texts } = await open(viewOf({ rules: [reviewRubric] }))

    expect(texts('.scheck')).toEqual(['Guidance for agents only: nothing is checked.'])
  })

  it('should say the check message once when two fields belong to the same check', async () => {
    const { texts, toggle, control } = await open(viewOf({ rules: [branchFormat] }))

    await toggle('rule-branch-format')

    expect(texts('.sfield label')).toEqual(['longLived', 'types'])
    expect(texts('.sfield .shint')).toEqual(['Use <type>/<slug>'])
    expect(control('rule-branch-format-0-types')?.getAttribute('aria-describedby')).toBe(
      'rule-branch-format-0',
    )
  })

  it('should say a field is a regular expression when its value is not a list of names', async () => {
    const { control, host } = await open(viewOf({ rules: [ticket] }))

    const input = control('rule-ticket-0-key')
    const described = input?.getAttribute('aria-describedby') ?? ''

    expect(input?.value).toBe('[A-Z]+-[0-9]+')
    expect(described).toBe('rule-ticket-0 rule-ticket-0-key-expression')
    expect(host.querySelector('#rule-ticket-0-key-expression')?.textContent).toBe(
      'A regular expression, used as written.',
    )
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

  it('should show the full value of a text field in its tooltip when it is cut', async () => {
    const { control } = await open(viewOf())

    expect(control('rule-commit-message-0-types')?.getAttribute('data-tip-full')).toBe('feat, fix')
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

  it('should draw the warning shape beside each notice when something needs attention', async () => {
    const { host } = await open(
      viewOf({
        agents: { ...viewOf().agents, shared: true, stale: true, claudeImportMissing: true },
        invalid: [{ path: `${ROOT}/.dck/rules/broken.md`, message: 'why: required' }],
      }),
    )

    const notices = [...host.querySelectorAll('.snotice')]

    expect(notices.map((notice) => notice.textContent)).toEqual([
      'The block in AGENTS.md is out of date',
      'CLAUDE.md does not import AGENTS.md',
      'Invalid files',
    ])
    for (const notice of notices) expect(notice.querySelector('svg.glyph-warning')).not.toBeNull()
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

    expect(calls).toEqual([['setEnabled', 7, ROOT, 'branch-format', true]])
    expect(control('rule-branch-format')?.checked).toBe(true)
    expect(control('rule-branch-format-0-types')?.value).toBe('feat, fix')
  })

  it('should say why in the language of the page without the detail when the switch fails', async () => {
    const { host, toggle, control, refuseWith } = await open(viewOf())
    refuseWith(fail(errorBody('DCK-RUL-002', 'EACCES: permission denied, /home/ana/acme')))

    await toggle('rule-branch-format')

    const box = control('rule-branch-format')
    const alert = host.querySelector('[role="alert"]')
    expect(box?.checked).toBe(false)
    expect(alert?.textContent).toBe('Could not write the file')
    expect(alert?.id).toBe('rule-branch-format-error')
    expect(box?.getAttribute('aria-describedby')).toBe(
      'rule-branch-format-hint rule-branch-format-error',
    )
  })

  it('should announce a failure once and keep showing it when the page is drawn again', async () => {
    const { host, toggle, refuseWith, redraw } = await open(viewOf())
    refuseWith(fail(errorBody('DCK-RUL-002')))
    await toggle('rule-branch-format')
    const announced = host.querySelectorAll('[role="alert"]').length

    redraw()

    expect(announced).toBe(1)
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.querySelector('#rule-branch-format-error')?.textContent).toBe(
      'Could not write the file',
    )
  })

  it('should save a list of names typed with commas and a number when their inputs change', async () => {
    const { calls, type, control } = await open(viewOf())

    await type('rule-commit-message-0-types', ' feat, fix docs ')
    await type('rule-commit-message-1-maxLength', '50')

    expect(calls).toEqual([
      ['setField', 7, ROOT, 'commit-message', 0, 'types', 'feat|fix|docs'],
      ['setField', 7, ROOT, 'commit-message', 1, 'maxLength', 50],
    ])
    expect(control('rule-commit-message-0-types')?.value).toBe('feat, fix, docs')
    expect(control('rule-commit-message-1-maxLength')?.value).toBe('50')
  })

  it('should refuse without asking the host and keep the list when a list field gets an expression', async () => {
    const { host, calls, type, control } = await open(viewOf())

    await type('rule-commit-message-0-types', 'feat, fix.*')

    const input = control('rule-commit-message-0-types')
    expect(calls).toEqual([])
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'This value does not work in the rule. The previous one was kept.',
    )
    expect(input?.value).toBe('feat, fix.*')
    expect(input?.getAttribute('aria-describedby')).toBe(
      'rule-commit-message-0 rule-commit-message-0-types-error',
    )
  })

  it('should show the failure under the label and keep what was typed when the value is refused', async () => {
    const { host, type, control, refuseWith } = await open(viewOf({ rules: [ticket] }))
    refuseWith(fail(errorBody('DCK-RUL-001', 'check.0.pattern: Unterminated group')))

    await type('rule-ticket-0-key', '[A-Z+')

    const input = control('rule-ticket-0-key')
    const alert = host.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe(
      'This value does not work in the rule. The previous one was kept.',
    )
    expect(alert?.className).toBe('serror')
    expect(input?.closest('.srow2')?.contains(alert ?? null)).toBe(true)
    expect(input?.value).toBe('[A-Z+')
    expect(input?.getAttribute('aria-invalid')).toBe('true')
  })

  it('should clear the failure when the corrected value is accepted', async () => {
    const { host, type, refuseWith } = await open(viewOf({ rules: [ticket] }))
    refuseWith(fail(errorBody('DCK-RUL-001', 'check.0.pattern: Unterminated group')))
    await type('rule-ticket-0-key', '[A-Z+')
    refuseWith(undefined)

    await type('rule-ticket-0-key', '[A-Z]+')

    expect(host.querySelector('.serror')).toBeNull()
  })

  it('should write the failure in the chosen language when a change is refused', async () => {
    const { host, toggle, refuseWith } = await open(viewOf(), 'pt-BR')
    refuseWith(fail(errorBody('DCK-RUL-003')))

    await toggle('rule-branch-format')

    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Fora de um repositório git')
  })

  it('should write nothing when a removed input reports a change', async () => {
    const { calls, control } = await open(viewOf())
    const input = control('rule-commit-message-0-types')
    input?.remove()

    if (input) input.value = 'fe'
    input?.dispatchEvent(new Event('change'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(calls).toEqual([])
  })
})

describe('createHarnessPage focus', () => {
  it('should keep the whole value of the next field selected when an edit is saved after Tab', async () => {
    const { calls, control, settle } = await open(
      viewOf({ rules: [{ ...branchFormat, enabled: true }] }),
    )
    const edited = control('rule-branch-format-0-longLived')
    const next = control('rule-branch-format-0-types')
    const length = next?.value.length ?? 0
    if (edited) edited.value = 'main, develop, trunk'
    edited?.dispatchEvent(new Event('input', { bubbles: true }))

    edited?.dispatchEvent(new Event('change', { bubbles: true }))
    next?.focus()
    next?.setSelectionRange(0, length)
    await settle()

    const drawn = control('rule-branch-format-0-types')
    expect(calls).toHaveLength(1)
    expect(drawn).not.toBe(next)
    expect(document.activeElement).toBe(drawn)
    expect([drawn?.selectionStart, drawn?.selectionEnd]).toEqual([0, length])
  })

  it('should keep what was typed and not saved yet when the page is drawn again', async () => {
    const { control, redraw } = await open(viewOf())
    const input = control('rule-commit-message-0-types')
    input?.focus()
    if (input) input.value = 'feat, fix, do'
    input?.dispatchEvent(new Event('input', { bubbles: true }))

    redraw()

    const drawn = control('rule-commit-message-0-types')
    expect(drawn).not.toBe(input)
    expect(drawn?.value).toBe('feat, fix, do')
    expect(document.activeElement).toBe(drawn)
  })
})

describe('createHarnessPage tabs', () => {
  it('should write into the repository shown when another tab became active after it was read', async () => {
    const { calls, toggle, switchTab } = await open(viewOf())
    switchTab(8, viewOf({ root: '/home/ana/acme/frontend' }))

    await toggle('rule-branch-format')

    expect(calls).toEqual([['setEnabled', 7, ROOT, 'branch-format', true]])
  })

  it('should show the repository of the new tab when it is read again after a tab change', async () => {
    const { host, switchTab, page } = await open(viewOf())
    switchTab(8, viewOf({ root: '/home/ana/acme/frontend' }))

    await page.refresh()

    expect(host.querySelector('.scontrol .spath')?.textContent).toBe('frontend')
  })

  it('should refuse the change when the tab of the page moved to another repository', async () => {
    const { host, toggle, moveTab, control } = await open(viewOf())
    moveTab(viewOf({ root: '/home/ana/acme/frontend' }))

    await toggle('rule-branch-format')

    expect(control('rule-branch-format')?.checked).toBe(false)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'The tab is in another repository now; nothing was written',
    )
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

    expect(calls).toEqual([['shareWithAgents', 7, ROOT, true]])
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

    expect(calls).toEqual([['shareWithAgents', 7, ROOT, false]])
    expect(control('harness-share')?.checked).toBe(false)
  })

  it('should offer to update the block and write it again when it is out of date', async () => {
    const { host, calls, press, control } = await open(withAgents({ shared: true, stale: true }))
    const before = host.textContent

    await press('harness-update')

    expect(before).toContain('The block in AGENTS.md is out of date')
    expect(calls).toEqual([['shareWithAgents', 7, ROOT, true]])
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
    expect(calls).toEqual([['addClaudeImport', 7, ROOT]])
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
