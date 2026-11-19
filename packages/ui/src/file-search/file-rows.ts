import {
  type FileGroups,
  type FileRow,
  folderOf,
  nameOf,
  type ShortcutId,
  type Translate,
  type Translator,
} from '@dck/core'

// What a row of the list does when it is picked
export type Choice =
  | { readonly kind: 'row'; readonly row: FileRow }
  // "N more": widens the search to every ignored file
  | { readonly kind: 'more' }

export interface RowsOptions {
  readonly t: Translate
  readonly plural: Translator['plural']
  readonly selected: number
  // Stepping into this closed folder: the list is its inside alone
  readonly folder?: string
  // Files listed when the listing stopped at its cap
  readonly truncated?: number
  // The action whose key widens the search, for the tooltip of "N more"
  readonly widenKey: ShortcutId
}

// An eye struck through: git does not track it
const IGNORED =
  '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.5 8 3 10 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
const STEP =
  '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ENTITIES[char] ?? char)

function option(row: FileRow, index: number, options: RowsOptions): string {
  const on = index === options.selected
  const ignored = escapeHtml(options.t('files.ignored'))
  // Inside a folder stepped into, the heading already says it is ignored and names the folder
  const inside = options.folder
  const folder = folderOf(row.path)
  const shown = inside && folder.startsWith(inside) ? folder.slice(inside.length) : folder
  return [
    `<button type="button" class="it frow${on ? ' on' : ''}" role="option" aria-selected="${on}" data-index="${index}"${row.ignored ? ` aria-description="${ignored}"` : ''}>`,
    `<span class="l">${escapeHtml(nameOf(row.path))}</span>`,
    `<span class="p">${escapeHtml(shown)}</span>`,
    row.folder
      ? `<span class="fmark" data-tip="${escapeHtml(options.t('files.stepInto'))}" data-tip-key="Enter">${STEP}</span>`
      : '',
    // Last, so the marks of every row line up at the right edge
    row.ignored && !inside ? `<span class="fmark" data-tip="${ignored}">${IGNORED}</span>` : '',
    '</button>',
  ].join('')
}

// Draws the project's rows, then the ignored group under its heading, and returns what each index picks.
// Built as one string: a hundred rows redrawn on every key
export function drawGroups(
  results: HTMLElement,
  groups: FileGroups,
  options: RowsOptions,
): readonly Choice[] {
  const { t } = options
  const choices: Choice[] = []
  const html: string[] = []
  for (const row of groups.project) {
    html.push(option(row, choices.length, options))
    choices.push({ kind: 'row', row })
  }
  if (groups.ignored.length > 0 || groups.more > 0) {
    const title = options.folder
      ? `${escapeHtml(options.folder)} · ${escapeHtml(t('files.ignored'))}`
      : escapeHtml(t('files.ignored'))
    html.push(`<div class="fgroup" role="presentation">${title}</div>`)
  }
  for (const row of groups.ignored) {
    html.push(option(row, choices.length, options))
    choices.push({ kind: 'row', row })
  }
  if (groups.more > 0) {
    const index = choices.length
    const on = index === options.selected
    html.push(
      `<button type="button" class="it fmore${on ? ' on' : ''}" role="option" aria-selected="${on}" data-index="${index}" data-tip="${escapeHtml(t('files.widen'))}" data-tip-shortcut="${options.widenKey}">${escapeHtml(options.plural('files.more', groups.more, { count: groups.more }))}</button>`,
    )
    choices.push({ kind: 'more' })
  }
  if (options.truncated !== undefined)
    html.push(
      `<div class="fnote">${escapeHtml(t('files.truncated', { count: options.truncated }))}</div>`,
    )
  // Redrawing resets the scroll; the selected row is brought back into view below
  results.innerHTML = html.join('')
  results.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  return choices
}
