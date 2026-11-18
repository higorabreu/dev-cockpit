import type { DiffModule, Translator } from '@dck/core'
import { h, icon } from '../panel/dom.ts'

// The header line is a file row's height; the line of commits under it is a little shorter
export const MODULE_LINE = 28
export const COMMITS_LINE = 20
// The subjects shown in the header; the rest is a count
export const INLINE_SUBJECTS = 3
// The tooltip stays compact: this many commits, each cut near this many characters
export const TIP_COMMITS = 5
export const TIP_CHARACTERS = 60
const CHEVRON = '<path d="M9 6l6 6-6 6"/>'

export const moduleHeight = (module: DiffModule) =>
  module.commitCount > 0 ? MODULE_LINE + COMMITS_LINE : MODULE_LINE

// A subject longer than the line ends in an ellipsis, cut at a word when one is near
export function cutSubject(subject: string, max = TIP_CHARACTERS): string {
  if (subject.length <= max) return subject
  const head = subject.slice(0, max - 1)
  const space = head.lastIndexOf(' ')
  return `${(space > max * 0.7 ? head.slice(0, space) : head).trimEnd()}…`
}

// One line per commit, newest first, at most TIP_COMMITS, then how many more there are
export function commitsTip(module: DiffModule, i18n: Translator): string {
  const lines = module.commits.slice(0, TIP_COMMITS).map((subject) => cutSubject(subject))
  const rest = module.commitCount - lines.length
  if (rest > 0) lines.push(i18n.t('review.module.moreTip', { count: rest }))
  return lines.join('\n')
}

// How a screen reader names a submodule's header: its path, its files and its new commits
export function moduleLabel(module: DiffModule, count: number, i18n: Translator): string {
  return i18n.t('review.a11y.module', {
    path: module.path,
    files: i18n.plural('review.module.files', count),
    commits: i18n.plural('review.a11y.commits', module.commitCount),
  })
}

// The line of new commits: up to INLINE_SUBJECTS subjects, then how many more, the list in the tooltip
function commitsLine(module: DiffModule, i18n: Translator): HTMLElement {
  const shown = module.commits.slice(0, INLINE_SUBJECTS)
  const rest = module.commitCount - shown.length
  // On each part too: the cut subjects would otherwise show their own text instead of the list
  const tip = commitsTip(module, i18n)
  return h(
    'span',
    { class: 'rv-mod-commits', 'data-tip': tip },
    shown.length > 0 && h('span', { class: 'rv-mod-subjects', 'data-tip': tip }, shown.join(' · ')),
    rest > 0 &&
      h('span', { class: 'rv-mod-more', 'data-tip': tip }, i18n.plural('review.module.more', rest)),
  )
}

// A submodule's header in the index: a chevron that turns when it opens, its path from the one that
// holds it, the "Submodule" tag and its file count, and its new commits on a second line
export function moduleHead(
  module: DiffModule,
  label: string,
  count: number,
  i18n: Translator,
): HTMLElement[] {
  const line = h(
    'span',
    { class: 'rv-mod-line' },
    icon(CHEVRON, 12, 'rv-chev'),
    h('span', { class: 'rv-mod-path', 'data-tip-full': module.path }, label),
    h('span', { class: 'rv-tag' }, i18n.t('review.submodule')),
    h(
      'span',
      { class: 'rv-mod-count', 'data-tip': i18n.plural('review.module.files', count) },
      String(count),
    ),
  )
  return module.commitCount > 0 ? [line, commitsLine(module, i18n)] : [line]
}
