import type { HostApi, MessageKey, Translator, UpdateNotice, UpdateState } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import type { Notice } from '../tabs/notice.ts'
import type { MenuAction, MenuHandle } from '../tabs/tab-menu.ts'

export interface UpdateNoticeDeps {
  readonly notice: Notice
  readonly i18n: Translator
  readonly updates: HostApi['updates']
  // Tabs where an agent runs now: a restart would end it
  agentTabs(): number
  // Writes the tabs at once, so the restarted cockpit opens them again
  saveTabs(): void
  // Gives the keys back to the terminal after a click
  done(): void
  // The compact notice's actions, in the tab bar's small menu beside its icon, under a caption when given
  openMenu(actions: readonly MenuAction[], anchor: HTMLElement, caption?: string): MenuHandle
}

interface Action {
  readonly label: MessageKey
  readonly focus: string
  run(): void
}

// How the compact icon tells the state apart, in shape as well as color: a dot for news, a diamond for a
// question, another glyph for a failure, nothing while it works
type Tone = 'news' | 'busy' | 'warning' | 'critical'

interface View {
  readonly texts: readonly (readonly [string, string?])[]
  readonly actions: readonly Action[]
  readonly dismiss: boolean
  readonly tone: Tone
  // The whole notice in one line, for the compact icon's tooltip and name
  readonly summary: string
  // Said above the compact menu's items when they answer a question
  readonly caption?: string
}

const UPDATE_GLYPH = '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>'
const FAILED_GLYPH = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.5v.01"/>'

// The update's place in the tab bar: what was found, the download, the install and the restart
export function createUpdateNotice(deps: UpdateNoticeDeps) {
  const { i18n, updates } = deps
  let state: UpdateState | undefined
  // "Restart" was pressed with an agent running: the notice asks before ending it
  let confirming = 0
  // The compact form's icon, when the last drawing had one, and its menu while open
  let compactIcon: HTMLElement | undefined
  let menu: MenuHandle | undefined

  const action = ({ label, run, focus }: Action) => {
    const button = h('button', { type: 'button', class: 'notice-action', 'data-focus': focus })
    button.textContent = i18n.t(label)
    button.addEventListener('click', () => {
      run()
      deps.done()
    })
    return button
  }

  const dismiss = () => updates.dismiss()

  function dismissButton() {
    const label = i18n.t('updates.dismiss')
    const button = h(
      'button',
      { type: 'button', class: 'notice-dismiss', 'data-tip': label, 'aria-label': label },
      icon('<path d="M7 7l10 10M17 7L7 17"/>', 12),
    )
    button.addEventListener('click', () => {
      dismiss()
      deps.done()
    })
    return button
  }

  function restart() {
    const agents = deps.agentTabs()
    if (agents > 0 && confirming === 0) {
      confirming = agents
      render()
      return
    }
    confirming = 0
    deps.saveTabs()
    updates.restart()
  }

  function cancel() {
    confirming = 0
    render()
  }

  function viewFor(notice: UpdateNotice, canInstall: boolean): View | undefined {
    const t = i18n.t
    switch (notice.kind) {
      case 'none':
        return undefined
      case 'available': {
        const summary = t('updates.available', { version: notice.version })
        const install: Action = {
          label: 'updates.update',
          run: () => updates.install(),
          focus: 'update-install',
        }
        const page: Action = {
          label: 'updates.whatsNew',
          run: () => updates.openRelease(),
          focus: 'update-page',
        }
        const actions = canInstall ? [install, page] : [page]
        return { texts: [[summary]], actions, dismiss: true, tone: 'news', summary }
      }
      case 'downloading': {
        const { version, percent } = notice
        const text = t('updates.downloading', { version })
        if (percent === undefined)
          return { texts: [[text]], actions: [], dismiss: false, tone: 'busy', summary: text }
        return {
          texts: [[text], [`${percent}%`, 'notice-count notice-percent']],
          actions: [],
          dismiss: false,
          tone: 'busy',
          summary: t('updates.downloadingPercent', { version, percent: String(percent) }),
        }
      }
      case 'installing': {
        const summary = t('updates.installing', { version: notice.version })
        return { texts: [[summary]], actions: [], dismiss: false, tone: 'busy', summary }
      }
      case 'installed': {
        if (confirming > 0) {
          const summary = i18n.plural('updates.agents', confirming)
          return {
            texts: [[summary, 'notice-text warning']],
            actions: [
              { label: 'updates.restartAnyway', run: restart, focus: 'update-restart-anyway' },
              { label: 'updates.cancel', run: cancel, focus: 'update-cancel' },
            ],
            dismiss: false,
            tone: 'warning',
            summary,
            caption: summary,
          }
        }
        const summary = t('updates.installed', { version: notice.version })
        return {
          texts: [[summary]],
          actions: [{ label: 'updates.restart', run: restart, focus: 'update-restart' }],
          dismiss: true,
          tone: 'news',
          summary,
        }
      }
      case 'failed': {
        const summary = t(`error.${notice.code}` as MessageKey)
        return {
          texts: [[summary, 'notice-text critical']],
          actions: [],
          dismiss: true,
          tone: 'critical',
          summary,
        }
      }
    }
  }

  function fullNodes(view: View): Node[] {
    return [
      ...view.texts.map(([value, className]) =>
        h('span', { class: className ?? 'notice-text' }, value),
      ),
      ...view.actions.map(action),
      ...(view.dismiss ? [dismissButton()] : []),
    ]
  }

  function menuActions(view: View): MenuAction[] {
    const entries = [
      ...view.actions,
      ...(view.dismiss ? [{ label: 'updates.dismiss' as const, run: dismiss, focus: '' }] : []),
    ]
    return entries.map((entry) => ({
      label: i18n.t(entry.label),
      enabled: true,
      run() {
        entry.run()
        // Restart with an agent running asks first: the menu comes back with the question's answers
        if (confirming > 0 && compactIcon?.isConnected) openMenu()
        else deps.done()
      },
    }))
  }

  function openMenu() {
    const view = state && viewFor(state.notice, state.canInstall)
    if (view && compactIcon) menu = deps.openMenu(menuActions(view), compactIcon, view.caption)
  }

  // A menu drawn for another state would offer what no longer applies
  function closeMenu() {
    menu?.close()
    menu = undefined
  }

  // One icon in place of the text and its buttons; its menu holds the same actions
  function compactNode(view: View): HTMLElement {
    const glyph = icon(view.tone === 'critical' ? FAILED_GLYPH : UPDATE_GLYPH, 17)
    const attributes = {
      class: 'notice-icon',
      'data-tone': view.tone,
      'data-tip': view.summary,
      'aria-label': view.summary,
    }
    if (view.actions.length === 0 && !view.dismiss)
      return h('span', { ...attributes, role: 'img' }, glyph)
    const button = h('button', { ...attributes, type: 'button', 'aria-haspopup': 'menu' }, glyph)
    button.addEventListener('click', openMenu)
    return button
  }

  function render() {
    const view = state && viewFor(state.notice, state.canInstall)
    compactIcon = view && compactNode(view)
    deps.notice.setLasting(view ? fullNodes(view) : [], compactIcon ? [compactIcon] : [])
  }

  return {
    show(next: UpdateState) {
      const changed = JSON.stringify(next) !== JSON.stringify(state)
      state = next
      if (next.notice.kind !== 'installed') confirming = 0
      if (changed) closeMenu()
      render()
    },
    retranslate() {
      closeMenu()
      render()
    },
    current: () => state,
  }
}
