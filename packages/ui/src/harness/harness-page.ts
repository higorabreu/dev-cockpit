import {
  describeError,
  type ErrorBody,
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

const group = (title: string | undefined, ...rows: Child[]) =>
  h('section', { class: 'sgroup' }, title && h('h2', {}, title), ...rows)

// A file of the repository reads better from its root; any other keeps its whole path
const shortPath = (path: string, root: string) =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : displayPath(path)

// The Harness page of the settings screen: the same rows and controls as the other pages
export function createHarnessPage(deps: HarnessPageDeps) {
  const { api, i18n } = deps
  const t = i18n.t
  let view: RulesView | undefined
  let loaded = false
  let confirmingShare = false
  // Failure text by control, shown beside it
  const errors = new Map<string, string>()
  // A refused value stays in its input so it can be corrected; the file keeps the previous one
  const drafts = new Map<string, string>()

  function failureText(error: ErrorBody): string {
    const code = errorCodeOf(error)
    const detail = error.message.slice(describeError(code).length + 2)
    return detail ? `${t(`error.${code}`)}: ${detail}` : t(`error.${code}`)
  }

  const focus = (key: string) =>
    document.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus()

  async function refresh() {
    const id = deps.ptyId()
    loaded = false
    confirmingShare = false
    errors.clear()
    drafts.clear()
    view = id === undefined ? undefined : await api.get(id)
    loaded = true
    deps.requestRender()
  }

  // `focusAfter` names the control to land on when the one that was used goes away with the change
  async function act(
    key: string,
    change: (ptyId: number) => Promise<RulesChange>,
    focusAfter?: string,
    // Shown in place of the failure detail, which for a field quotes the regular expression
    refusal?: string,
  ) {
    const id = deps.ptyId()
    if (id === undefined) return
    const result = await change(id)
    if (result.ok) {
      view = result.value
      errors.delete(key)
      drafts.delete(key)
    } else errors.set(key, refusal ?? failureText(result.error))
    deps.requestRender()
    if (focusAfter) focus(focusAfter)
  }

  function failure(key: string, className = 'serror') {
    const error = errors.get(key)
    return error !== undefined && h('div', { class: className, role: 'alert' }, error)
  }

  function row(key: string, label: Child, hint: string | undefined, ...controls: Child[]) {
    return h(
      'div',
      { class: 'srow2' },
      h(
        'div',
        { class: 'slabel' },
        label,
        hint && h('span', { class: 'shint', id: `${key}-hint` }, hint),
        failure(key),
      ),
      h('div', { class: 'scontrol' }, ...controls),
    )
  }

  const labelFor = (key: string, text: string) => h('label', { class: 'sname2', for: key }, text)

  // The limit is a word of the interface; a variable name is a key of the file, so it reads as code
  const fieldLabel = (key: string, field: RuleField) =>
    field.name === MAX_LENGTH_FIELD && field.kind === 'number'
      ? labelFor(key, t('harness.field.maxLength'))
      : h('label', { class: 'sname2 smono', for: key }, field.name)

  const button = (key: string, text: string, className = 'srecord') =>
    h('button', { type: 'button', class: className, 'data-focus': key }, text)

  // One message explains the check; the fields under it are its knobs
  const checkHint = (id: string, message: string) =>
    h('div', { class: 'shint scheck', id }, message)

  function checkbox(key: string, checked: boolean, onChange: (checked: boolean) => void) {
    const input = h('input', {
      type: 'checkbox',
      id: key,
      'data-focus': key,
      'aria-describedby': `${key}-hint`,
    })
    input.checked = checked
    input.addEventListener('change', () => onChange(input.checked))
    return input
  }

  const fieldKey = (hintId: string, field: RuleField) => `${hintId}-${field.name}`

  function fieldRow(rule: RuleView, field: RuleField, hintId: string): HTMLElement {
    const key = fieldKey(hintId, field)
    const isNumber = field.kind === 'number'
    const input = h('input', {
      type: isNumber ? 'number' : 'text',
      min: isNumber ? '1' : undefined,
      id: key,
      spellcheck: 'false',
      autocomplete: 'off',
      'data-focus': key,
      'aria-describedby': hintId,
      'aria-invalid': errors.has(key) ? 'true' : undefined,
    })
    // Names are typed with commas; the bar of the expression never shows
    const isList = isNameList(field.value)
    const shown = isList ? listText(String(field.value)) : String(field.value)
    input.value = drafts.get(key) ?? shown
    input.addEventListener('change', () => {
      const typed = input.value.trim()
      const text = isList ? listValue(typed) : typed
      drafts.set(key, typed)
      void act(
        key,
        (ptyId) =>
          api.setField(ptyId, rule.id, field.check, field.name, isNumber ? Number(text) : text),
        undefined,
        t('harness.field.refused'),
      )
    })
    return h(
      'div',
      { class: 'srow2 sfield' },
      h('div', { class: 'slabel' }, fieldLabel(key, field)),
      h('div', { class: 'scontrol' }, input),
    )
  }

  function fieldRows(rule: RuleView): HTMLElement[] {
    return rule.fields.flatMap((field, index) => {
      const hintId = `rule-${rule.id}-${field.check}`
      const opensCheck = rule.fields[index - 1]?.check !== field.check
      return [
        ...(opensCheck ? [checkHint(hintId, field.message)] : []),
        fieldRow(rule, field, hintId),
        // A refusal can be long (it quotes the expression), so it gets the whole width under the input
        failure(fieldKey(hintId, field), 'serror scheck'),
      ].filter((node) => node !== false)
    })
  }

  function ruleRows(rule: RuleView): HTMLElement[] {
    const key = `rule-${rule.id}`
    const toggle = checkbox(key, rule.enabled, (checked) => {
      void act(key, (ptyId) => api.setEnabled(ptyId, rule.id, checked))
    })
    return [
      row(key, labelFor(key, rule.title), rule.why, toggle),
      ...(rule.enabled ? fieldRows(rule) : []),
    ]
  }

  // Sharing writes a file of the repository, so switching it on asks once more, in place
  function shareRow({ agents, root }: RulesView): HTMLElement {
    const share = (on: boolean) => {
      confirmingShare = false
      void act(SHARE, (ptyId) => api.shareWithAgents(ptyId, on), SHARE)
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
      ? button(`${SHARE}-confirm`, t('harness.share.confirm'))
      : undefined
    confirm?.addEventListener('click', () => share(true))
    const hint = confirmingShare
      ? t('harness.share.confirmHint', { file: shortPath(agents.file, root) })
      : t('harness.share.hint')
    return row(SHARE, labelFor(SHARE, t('harness.share')), hint, confirm, toggle)
  }

  function noticeRow(key: string, label: string, hint: string, action: HTMLElement): HTMLElement {
    return row(key, h('span', { class: 'sname2' }, label), hint, action)
  }

  function agentsRows(current: RulesView): HTMLElement[] {
    const { agents } = current
    const update = button('harness-update', t('harness.update'))
    update.addEventListener(
      'click',
      () => void act('harness-update', (ptyId) => api.shareWithAgents(ptyId, true), SHARE),
    )
    const addImport = button('harness-claude-import', t('harness.claudeImport.add'))
    addImport.addEventListener(
      'click',
      () => void act('harness-claude-import', (ptyId) => api.addClaudeImport(ptyId), SHARE),
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

  const emptyRow = (text: string) =>
    h('div', { class: 'srow2' }, h('span', { class: 'shint' }, text))

  function render(): Node[] {
    if (!loaded) return []
    if (!view) return [group(undefined, emptyRow(t('harness.notRepository')))]
    const { root, rules, invalid } = view
    return [
      group(
        undefined,
        row(
          'harness-repository',
          h('span', { class: 'sname2' }, t('harness.repository')),
          undefined,
          h('span', { class: 'spath' }, displayPath(root)),
        ),
      ),
      group(
        t('settings.group.harness'),
        h('p', { class: 'shint sintro' }, t('harness.summary')),
        ...(rules.length > 0 ? rules.flatMap(ruleRows) : [emptyRow(t('harness.empty'))]),
      ),
      group(t('harness.group.agents'), ...agentsRows(view)),
      invalid.length > 0 &&
        group(
          t('harness.group.invalid'),
          ...invalid.map(({ path, message }) =>
            h(
              'div',
              { class: 'srow2' },
              h(
                'div',
                { class: 'slabel' },
                h('span', { class: 'spath' }, shortPath(path, root)),
                h('span', { class: 'shint' }, message),
              ),
            ),
          ),
        ),
    ].filter((node) => node !== false)
  }

  return {
    // Reads the rules again: called when the page is opened
    refresh,
    render,
  }
}

export type HarnessPage = ReturnType<typeof createHarnessPage>
