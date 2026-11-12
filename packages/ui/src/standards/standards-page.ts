import {
  describeError,
  type ErrorBody,
  errorCodeOf,
  type HostApi,
  type RuleField,
  type StandardsChange,
  type StandardsView,
  type StandardView,
  type Translator,
} from '@dck/core'
import { h } from '../panel/dom.ts'
import { displayPath } from '../panel/format.ts'

type Child = Node | string | false | undefined

export interface StandardsPageDeps {
  readonly api: HostApi['standards']
  readonly i18n: Translator
  // The terminal of the active tab: the page is about the repository it is in
  ptyId(): number | undefined
  // Redraws the screen that hosts the page, keeping the focus where it was
  requestRender(): void
}

const SHARE = 'std-share'

const group = (title: string | undefined, ...rows: Child[]) =>
  h('section', { class: 'sgroup' }, title && h('h2', {}, title), ...rows)

// A file of the repository reads better from its root; any other keeps its whole path
const shortPath = (path: string, root: string) =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : displayPath(path)

// The Standards page of the settings screen: the same rows and controls as the other pages
export function createStandardsPage(deps: StandardsPageDeps) {
  const { api, i18n } = deps
  const t = i18n.t
  let view: StandardsView | undefined
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
    change: (ptyId: number) => Promise<StandardsChange>,
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

  const button = (key: string, text: string, className = 'srecord') =>
    h('button', { type: 'button', class: className, 'data-focus': key }, text)

  // One message explains the rule; the fields under it are its knobs
  const ruleHint = (id: string, message: string) => h('div', { class: 'shint srule', id }, message)

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

  function fieldRow(standard: StandardView, field: RuleField, hintId: string): HTMLElement {
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
    input.value = drafts.get(key) ?? String(field.value)
    input.addEventListener('change', () => {
      const text = input.value.trim()
      drafts.set(key, text)
      void act(
        key,
        (ptyId) =>
          api.setField(ptyId, standard.id, field.rule, field.name, isNumber ? Number(text) : text),
        undefined,
        t('standards.field.refused'),
      )
    })
    return h(
      'div',
      { class: 'srow2 sfield' },
      h('div', { class: 'slabel' }, labelFor(key, field.name)),
      h('div', { class: 'scontrol' }, input),
    )
  }

  function fieldRows(standard: StandardView): HTMLElement[] {
    return standard.fields.flatMap((field, index) => {
      const hintId = `std-${standard.id}-${field.rule}`
      const opensRule = standard.fields[index - 1]?.rule !== field.rule
      return [
        ...(opensRule ? [ruleHint(hintId, field.message)] : []),
        fieldRow(standard, field, hintId),
        // A refusal can be long (it quotes the expression), so it gets the whole width under the input
        failure(fieldKey(hintId, field), 'serror srule'),
      ].filter((node) => node !== false)
    })
  }

  function standardRows(standard: StandardView): HTMLElement[] {
    const key = `std-${standard.id}`
    const toggle = checkbox(key, standard.enabled, (checked) => {
      void act(key, (ptyId) => api.setEnabled(ptyId, standard.id, checked))
    })
    return [
      row(key, labelFor(key, standard.title), standard.why, toggle),
      ...(standard.enabled ? fieldRows(standard) : []),
    ]
  }

  // Sharing writes a file of the repository, so switching it on asks once more, in place
  function shareRow({ agents, root }: StandardsView): HTMLElement {
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
      ? button(`${SHARE}-confirm`, t('standards.share.confirm'))
      : undefined
    confirm?.addEventListener('click', () => share(true))
    const hint = confirmingShare
      ? t('standards.share.confirmHint', { file: shortPath(agents.file, root) })
      : t('standards.share.hint')
    return row(SHARE, labelFor(SHARE, t('standards.share')), hint, confirm, toggle)
  }

  function noticeRow(key: string, label: string, hint: string, action: HTMLElement): HTMLElement {
    return row(key, h('span', { class: 'sname2' }, label), hint, action)
  }

  function agentsRows(current: StandardsView): HTMLElement[] {
    const { agents } = current
    const update = button('std-update', t('standards.update'))
    update.addEventListener(
      'click',
      () => void act('std-update', (ptyId) => api.shareWithAgents(ptyId, true), SHARE),
    )
    const addImport = button('std-claude-import', t('standards.claudeImport.add'))
    addImport.addEventListener(
      'click',
      () => void act('std-claude-import', (ptyId) => api.addClaudeImport(ptyId), SHARE),
    )
    return [
      shareRow(current),
      ...(agents.stale
        ? [noticeRow('std-update', t('standards.stale'), t('standards.stale.hint'), update)]
        : []),
      // Without the block there is nothing Claude Code would miss
      ...(agents.shared && agents.claudeImportMissing
        ? [
            noticeRow(
              'std-claude-import',
              t('standards.claudeImport'),
              t('standards.claudeImport.hint'),
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
    if (!view) return [group(undefined, emptyRow(t('standards.notRepository')))]
    const { root, standards, invalid } = view
    return [
      group(
        undefined,
        row(
          'std-repository',
          h('span', { class: 'sname2' }, t('standards.repository')),
          undefined,
          h('span', { class: 'spath' }, displayPath(root)),
        ),
      ),
      group(
        t('settings.group.standards'),
        ...(standards.length > 0
          ? standards.flatMap(standardRows)
          : [emptyRow(t('standards.empty'))]),
      ),
      group(t('standards.group.agents'), ...agentsRows(view)),
      invalid.length > 0 &&
        group(
          t('standards.group.invalid'),
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
    // Reads the standards again: called when the page is opened
    refresh,
    render,
  }
}

export type StandardsPage = ReturnType<typeof createStandardsPage>
