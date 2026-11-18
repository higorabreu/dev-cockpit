import type { HostApi, MessageKey, Translator, UpdateNotice, UpdateState } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import type { Notice } from '../tabs/notice.ts'

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
}

// The update's place in the tab bar: what was found, the download, the install and the restart
export function createUpdateNotice(deps: UpdateNoticeDeps) {
  const { i18n, updates } = deps
  let state: UpdateState | undefined
  // "Restart" was pressed with an agent running: the notice asks before ending it
  let confirming = 0

  const action = (label: MessageKey, run: () => void, focus: string) => {
    const button = h('button', { type: 'button', class: 'notice-action', 'data-focus': focus })
    button.textContent = i18n.t(label)
    button.addEventListener('click', () => {
      run()
      deps.done()
    })
    return button
  }

  function dismissButton() {
    const label = i18n.t('updates.dismiss')
    const button = h(
      'button',
      { type: 'button', class: 'notice-dismiss', 'data-tip': label, 'aria-label': label },
      icon('<path d="M7 7l10 10M17 7L7 17"/>', 12),
    )
    button.addEventListener('click', () => {
      updates.dismiss()
      deps.done()
    })
    return button
  }

  const text = (value: string, className = 'notice-text') => h('span', { class: className }, value)

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

  function nodesFor(notice: UpdateNotice, canInstall: boolean): Node[] {
    const t = i18n.t
    switch (notice.kind) {
      case 'none':
        return []
      case 'available':
        return [
          text(t('updates.available', { version: notice.version })),
          canInstall && action('updates.update', () => updates.install(), 'update-install'),
          action('updates.whatsNew', () => updates.openRelease(), 'update-page'),
          dismissButton(),
        ].filter((node): node is HTMLElement => node !== false)
      case 'downloading':
        return [
          text(t('updates.downloading', { version: notice.version })),
          notice.percent !== undefined && text(`${notice.percent}%`, 'notice-count notice-percent'),
        ].filter((node): node is HTMLElement => node !== false)
      case 'installing':
        return [text(t('updates.installing', { version: notice.version }))]
      case 'installed':
        if (confirming > 0)
          return [
            text(i18n.plural('updates.agents', confirming), 'notice-text warning'),
            action('updates.restartAnyway', restart, 'update-restart-anyway'),
            action(
              'updates.cancel',
              () => {
                confirming = 0
                render()
              },
              'update-cancel',
            ),
          ]
        return [
          text(t('updates.installed', { version: notice.version })),
          action('updates.restart', restart, 'update-restart'),
          dismissButton(),
        ]
      case 'failed':
        return [
          text(t(`error.${notice.code}` as MessageKey), 'notice-text critical'),
          dismissButton(),
        ]
    }
  }

  function render() {
    deps.notice.setLasting(state ? nodesFor(state.notice, state.canInstall) : [])
  }

  return {
    show(next: UpdateState) {
      state = next
      if (next.notice.kind !== 'installed') confirming = 0
      render()
    },
    retranslate: render,
    current: () => state,
  }
}
