import {
  errorCodeOf,
  type HostApi,
  isNameList,
  listText,
  listValue,
  MAX_LENGTH_FIELD,
  type RuleField,
  type RulesChange,
  type RulesView,
  type RuleView,
  type Translator,
} from '@dck/core'
import { h } from '../panel/dom.ts'
import { displayPath } from '../panel/format.ts'
import { activityGlyph } from '../panel/glyphs.ts'

type Child = Node | string | false | undefined

export interface HarnessPageDeps {
  readonly api: HostApi['rules']
  readonly i18n: Translator
  // The terminal of the active tab: the page is about the repository it is in
  ptyId(): number | undefined
  // Redraws the screen that hosts the page, keeping the focus where it was
  requestRender(): void
}

const SHARE = 'harness-share'

// The page's own class: its controls shrink and its hints wrap, unlike the other pages
const group = (title: Child, ...rows: Child[]) =>
  h('section', { class: 'sgroup sharness' }, title && h('h2', {}, title), ...rows)

// A file of the repository reads better from its root; any other keeps its whole path
const shortPath = (path: string, root: string) =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : displayPath(path)

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

const warning = () => activityGlyph('warning')

const hint = (id: string | undefined, text: string, className = 'shint') =>
  h('span', { class: className, id }, text)

const ids = (...list: (string | false | undefined)[]) => list.filter(Boolean).join(' ')

// The Harness page of the settings screen: the same rows and controls as the other pages
export function createHarnessPage(deps: HarnessPageDeps) {
  const { api, i18n } = deps
  const t = i18n.t
  let view: RulesView | undefined
  // The tab the view was read from: a change goes to it, even after another tab became active
  let shownPty: number | undefined
  let loaded = false
  let reads = 0
  let confirmingShare = false
  // Failure text by control, shown beside it
  const errors = new Map<string, string>()
  // Failures not drawn yet: only their first drawing is announced
  const fresh = new Set<string>()
  // A refused value stays in its input so it can be corrected; the file keeps the previous one
  const drafts = new Map<string, string>()

  const focus = (key: string) =>
    document.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus()

  async function refresh() {
    const id = deps.ptyId()
    const reading = ++reads
    loaded = false
    confirmingShare = false
    errors.clear()
    drafts.clear()
    const next = id === undefined ? undefined : await api.get(id)
    // Another tab became active while this one was read: its own read draws the page
    if (reading !== reads) return
    view = next
    shownPty = id
    loaded = true
    deps.requestRender()
  }

  function refuse(key: string, text: string) {
    errors.set(key, text)
    fresh.add(key)
    deps.requestRender()
  }

  // `focusAfter` names the control to land on when the one that was used goes away with the change
  async function act(
    key: string,
    change: (ptyId: number, root: string) => Promise<RulesChange>,
    focusAfter?: string,
    // For a refused value, in place of the detail, which quotes the regular expression
    refusal?: string,
  ) {
    const reading = reads
    if (shownPty === undefined || view === undefined) return
    const result = await change(shownPty, view.root)
    if (reading !== reads) return
    if (!result.ok) {
      // The detail is logged by the host; the page says what happened in the user's language
      const code = errorCodeOf(result.error)
      return refuse(key, code === 'DCK-RUL-001' && refusal ? refusal : t(`error.${code}`))
    }
    view = result.value
    errors.delete(key)
    drafts.delete(key)
    deps.requestRender()
    if (focusAfter) focus(focusAfter)
  }

  const errorId = (key: string) => errors.has(key) && `${key}-error`

  function failure(key: string) {
    const error = errors.get(key)
    if (error === undefined) return false
    const role = fresh.has(key) ? 'alert' : undefined
    return h('span', { class: 'serror', id: `${key}-error`, role }, error)
  }

  function row(key: string, label: Child, hints: readonly Child[], ...controls: Child[]) {
    return h(
      'div',
      { class: 'srow2' },
      h('div', { class: 'slabel' }, label, ...hints, failure(key)),
      h('div', { class: 'scontrol' }, ...controls),
    )
  }

  const labelFor = (key: string, text: string) => h('label', { class: 'sname2', for: key }, text)

  // The limit is a word of the interface; a variable name is a key of the file, so it reads as code
  const fieldLabel = (key: string, field: RuleField) =>
    field.name === MAX_LENGTH_FIELD && field.kind === 'number'
      ? labelFor(key, t('harness.field.maxLength'))
      : h('label', { class: 'sname2 smono', for: key }, field.name)

  // `hintOf` is the row whose hint explains the button, so a reader hears it with the name
  function button(key: string, text: string, hintOf: string, errorOf = key) {
    const describedBy = ids(`${hintOf}-hint`, errorId(errorOf))
    return h(
      'button',
      { type: 'button', class: 'srecord', 'data-focus': key, 'aria-describedby': describedBy },
      text,
    )
  }

  // A check with no field to edit, or a rule with no check, still says what it asks for
  const checkLine = (id: string, message: string) =>
    h('div', { class: 'shint scheck', id }, message)

  function checkbox(key: string, checked: boolean, onChange: (checked: boolean) => void) {
    const input = h('input', {
      type: 'checkbox',
      id: key,
      'data-focus': key,
      'aria-describedby': ids(`${key}-hint`, errorId(key)),
    })
    input.checked = checked
    input.addEventListener('change', () => onChange(input.checked))
    return input
  }

  function fieldRow(rule: RuleView, field: RuleField, hintId: string, message?: string) {
    const key = `${hintId}-${field.name}`
    const isNumber = field.kind === 'number'
    // Names are typed with commas; the bar of the expression never shows
    const isList = isNameList(field.value)
    const isExpression = !isNumber && !isList
    const expressionId = `${key}-expression`
    const input = h('input', {
      type: isNumber ? 'number' : 'text',
      min: isNumber ? '1' : undefined,
      id: key,
      spellcheck: 'false',
      autocomplete: 'off',
      'data-focus': key,
      'aria-describedby': ids(hintId, isExpression && expressionId, errorId(key)),
      'aria-invalid': errors.has(key) ? 'true' : undefined,
    })
    input.value = drafts.get(key) ?? (isList ? listText(field.value) : String(field.value))
    if (!isNumber) input.setAttribute('data-tip-full', input.value)
    input.addEventListener('change', () => {
      // Removing a focused input fires its change; that half-typed value is not a choice
      if (!input.isConnected) return
      const typed = input.value.trim()
      drafts.set(key, typed)
      // One typo must not turn a list into an expression for good
      if (isList && !isNameList(listValue(typed))) return refuse(key, t('harness.field.refused'))
      const value = isNumber ? Number(typed) : isList ? listValue(typed) : typed
      void act(
        key,
        (ptyId, root) => api.setField(ptyId, root, rule.id, field.check, field.name, value),
        undefined,
        t('harness.field.refused'),
      )
    })
    return h(
      'div',
      { class: 'srow2 sfield' },
      h(
        'div',
        { class: 'slabel' },
        fieldLabel(key, field),
        message && hint(hintId, message),
        isExpression && hint(expressionId, t('harness.field.expression')),
        failure(key),
      ),
      h('div', { class: isNumber ? 'scontrol' : 'scontrol swide' }, input),
    )
  }

  // The message of a check explains its first field; a check with no field gets a line of its own
  function checkRows(rule: RuleView): HTMLElement[] {
    if (rule.checks.length === 0) {
      return [checkLine(`rule-${rule.id}-guidance`, t('harness.guidance'))]
    }
    return rule.checks.flatMap((message, check) => {
      const hintId = `rule-${rule.id}-${check}`
      const fields = rule.fields.filter((field) => field.check === check)
      if (fields.length === 0) return [checkLine(hintId, message)]
      return fields.map((field, index) =>
        fieldRow(rule, field, hintId, index === 0 ? message : undefined),
      )
    })
  }

  function ruleRows(rule: RuleView): HTMLElement[] {
    const key = `rule-${rule.id}`
    const toggle = checkbox(key, rule.enabled, (checked) => {
      void act(key, (ptyId, root) => api.setEnabled(ptyId, root, rule.id, checked))
    })
    return [
      row(key, labelFor(key, rule.title), [hint(`${key}-hint`, rule.why)], toggle),
      ...(rule.enabled ? checkRows(rule) : []),
    ]
  }

  // Sharing writes a file of the repository, so switching it on asks once more, in place
  function shareRow({ agents, root }: RulesView): HTMLElement {
    const share = (on: boolean) => {
      confirmingShare = false
      void act(SHARE, (ptyId, shown) => api.shareWithAgents(ptyId, shown, on), SHARE)
    }
    // The box only shows checked once the block is written, so a pending confirmation does not look done
    const toggle = checkbox(SHARE, agents.shared, (checked) => {
      if (agents.shared) return share(false)
      // A second click on the box gives up the pending confirmation
      confirmingShare = checked && !confirmingShare
      deps.requestRender()
      if (confirmingShare) focus(`${SHARE}-confirm`)
    })
    const confirm = confirmingShare
      ? button(`${SHARE}-confirm`, t('harness.share.confirm'), SHARE)
      : undefined
    confirm?.addEventListener('click', () => share(true))
    const text = confirmingShare
      ? t('harness.share.confirmHint', { file: shortPath(agents.file, root) })
      : t('harness.share.hint')
    return row(
      SHARE,
      labelFor(SHARE, t('harness.share')),
      [hint(`${SHARE}-hint`, text)],
      confirm,
      toggle,
    )
  }

  function noticeRow(key: string, label: string, text: string, action: HTMLElement): HTMLElement {
    const name = h('span', { class: 'sname2 snotice' }, warning(), label)
    return row(key, name, [hint(`${key}-hint`, text)], action)
  }

  function agentsRows(current: RulesView): HTMLElement[] {
    const { agents } = current
    const update = button('harness-update', t('harness.update'), 'harness-update')
    update.addEventListener(
      'click',
      () =>
        void act('harness-update', (ptyId, root) => api.shareWithAgents(ptyId, root, true), SHARE),
    )
    const addImport = button(
      'harness-claude-import',
      t('harness.claudeImport.add'),
      'harness-claude-import',
    )
    addImport.addEventListener(
      'click',
      () =>
        void act('harness-claude-import', (ptyId, root) => api.addClaudeImport(ptyId, root), SHARE),
    )
    return [
      shareRow(current),
      ...(agents.stale
        ? [noticeRow('harness-update', t('harness.stale'), t('harness.stale.hint'), update)]
        : []),
      // Without the block there is nothing Claude Code would miss
      ...(agents.shared && agents.claudeImportMissing
        ? [
            noticeRow(
              'harness-claude-import',
              t('harness.claudeImport'),
              t('harness.claudeImport.hint'),
              addImport,
            ),
          ]
        : []),
    ]
  }

  const emptyRow = (text: string) => h('div', { class: 'srow2' }, hint(undefined, text))

  function repositoryRow(root: string): HTMLElement {
    const key = 'harness-repository'
    return row(
      key,
      h('span', { class: 'sname2' }, t('harness.repository')),
      [
        hint(`${key}-path`, displayPath(root), 'shint smono'),
        hint(`${key}-hint`, t('harness.repository.hint')),
      ],
      h('span', { class: 'spath' }, folderName(root)),
    )
  }

  function invalidGroup({ root, invalid }: RulesView): HTMLElement | false {
    if (invalid.length === 0) return false
    return group(
      h('span', { class: 'snotice' }, warning(), t('harness.group.invalid')),
      ...invalid.map(({ path, message }) =>
        h(
          'div',
          { class: 'srow2' },
          h(
            'div',
            { class: 'slabel' },
            h('span', { class: 'spath' }, shortPath(path, root)),
            hint(undefined, message),
          ),
        ),
      ),
    )
  }

  function draw(): Node[] {
    if (!loaded) return []
    if (!view) return [group(undefined, emptyRow(t('harness.notRepository')))]
    const { root, rules } = view
    return [
      group(undefined, repositoryRow(root)),
      group(
        t('settings.group.harness'),
        h('p', { class: 'shint sintro' }, t('harness.summary')),
        ...(rules.length > 0 ? rules.flatMap(ruleRows) : [emptyRow(t('harness.empty'))]),
      ),
      group(t('harness.group.agents'), ...agentsRows(view)),
      invalidGroup(view),
    ].filter((node) => node !== false)
  }

  return {
    // Reads the rules again: called when the page is opened and when the active tab changes under it
    refresh,
    render(): Node[] {
      const nodes = draw()
      fresh.clear()
      return nodes
    },
  }
}

export type HarnessPage = ReturnType<typeof createHarnessPage>
