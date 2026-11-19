import { errorCodeOf, type MessageKey, type Translate } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import type { FileProblem } from './file-session.ts'

export interface StripActions {
  showMerged(): void
  undoMerge(): void
  dismiss(): void
  reload(): void
  keepMine(): void
  compare(): void
  saveAgain(): void
  closeFile(): void
  retry(): void
}

const CLOSE = '<path d="M6 6l12 12M18 6L6 18"/>'

const action = (label: string, run: () => void) => {
  const button = h('button', { type: 'button', class: 'fv-action' }, label)
  button.addEventListener('click', run)
  return button
}

// The line under the header that says what happened with the disk, and what can be done about it; the
// mark's shape tells them apart (a filled dot for a conflict, as on the tab, a ring for a merge)
export function createStrip(
  problem: FileProblem,
  t: Translate,
  actions: StripActions,
  comparing: boolean,
): HTMLElement {
  const parts = stripParts(problem, t, actions, comparing)
  const dismiss =
    problem.kind === 'merged' || problem.kind === 'save-failed'
      ? h(
          'button',
          {
            type: 'button',
            class: 'fv-strip-close',
            'aria-label': t('files.dismiss'),
            'data-tip': t('files.dismiss'),
          },
          icon(CLOSE, 13),
        )
      : undefined
  dismiss?.addEventListener('click', actions.dismiss)
  const kind = problem.kind === 'merged' ? 'merged' : 'conflict'
  return h(
    'div',
    { class: 'fv-strip', 'data-kind': kind, role: 'status' },
    h('span', { class: `fv-strip-mark ${kind}`, 'aria-hidden': 'true' }),
    h(
      'span',
      { class: 'fv-strip-text' },
      parts.text,
      parts.detail && h('span', { class: 'fv-strip-detail' }, parts.detail),
    ),
    ...parts.actions,
    dismiss,
  )
}

interface StripParts {
  readonly text: string
  readonly detail?: string
  readonly actions: readonly HTMLElement[]
}

function stripParts(
  problem: FileProblem,
  t: Translate,
  actions: StripActions,
  comparing: boolean,
): StripParts {
  if (problem.kind === 'merged')
    return {
      text: t('files.merged'),
      actions: [
        action(t('files.merged.show'), actions.showMerged),
        action(t('files.merged.undo'), actions.undoMerge),
      ],
    }
  if (problem.kind === 'deleted')
    return {
      text: t('files.deleted'),
      actions: [
        action(t('files.saveAgain'), actions.saveAgain),
        action(t('files.close'), actions.closeFile),
      ],
    }
  if (problem.kind === 'save-failed')
    return {
      text: t('files.saveFailed', { error: t(`error.${errorCodeOf(problem.error)}`) }),
      actions: [action(t('files.retry'), actions.retry)],
    }
  const reason = problem.reason
  const both = problem.disk !== undefined
  return {
    text: t('files.changedOnDisk'),
    ...(reason ? { detail: t(`files.reason.${reason}` as MessageKey) } : {}),
    actions: [
      action(t('files.reload'), actions.reload),
      ...(both
        ? [
            action(t('files.keepMine'), actions.keepMine),
            action(t(comparing ? 'files.compare.back' : 'files.compare'), actions.compare),
          ]
        : []),
    ],
  }
}
