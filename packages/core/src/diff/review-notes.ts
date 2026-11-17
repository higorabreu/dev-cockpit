import type { Translate } from '../i18n/translator.ts'
import { shellQuote } from '../paste/paste-paths.ts'
import type { SessionActivityInfo } from '../ports/session.ts'

// Review files kept in their folder; older ones are deleted when a new one is written
export const REVIEW_NOTES_KEPT = 5
// The file's name in the repository's git folder, and in the system's temporary folder
export const REVIEW_NOTES_PREFIX = 'review-'
export const REVIEW_NOTES_TEMP_PREFIX = 'dck-review-'

const two = (value: number) => String(value).padStart(2, '0')

// Local time as YYYYMMDD-HHMMSS, so the names sort by when they were written
export function reviewStamp(date: Date): string {
  const day = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`
  return `${day}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
}

// `review-20261117-143000.md`, and `-2.md` and on for another one written in the same second
export const reviewNoteName = (prefix: string, stamp: string, copy = 1) =>
  `${prefix}${stamp}${copy > 1 ? `-${copy}` : ''}.md`

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The review files of a folder past the newest few, to delete; any other file is left alone
export function staleReviewNotes(
  names: readonly string[],
  prefix: string,
  kept = REVIEW_NOTES_KEPT,
): string[] {
  const pattern = new RegExp(`^${escaped(prefix)}(\\d{8}-\\d{6})(?:-(\\d+))?\\.md$`)
  const notes = names.flatMap((name) => {
    const match = pattern.exec(name)
    return match ? [{ name, stamp: match[1] ?? '', copy: Number(match[2] ?? 1) }] : []
  })
  notes.sort((a, b) => (a.stamp === b.stamp ? b.copy - a.copy : a.stamp < b.stamp ? 1 : -1))
  return notes.slice(kept).map((note) => note.name)
}

// A path as seen from a folder: relative when it is inside it, else as it is; either separator counts
export function pathFrom(folder: string, path: string): string {
  const base = folder.replace(/[\\/]+$/, '')
  const rest = path.slice(base.length)
  const inside = base !== '' && path.startsWith(base) && /^[\\/]./.test(rest)
  return inside ? rest.slice(1) : path
}

// The one line typed at the prompt: what to do and where the comments are, quoted for a shell if needed
export function reviewPrompt(t: Translate, path: string): string {
  return t('review.notes.prompt', { path: shellQuote(path) })
}

// Why the line cannot go to the tab now, or undefined when an agent runs there: at a shell prompt it would
// land in the shell, and another program would read it as its own input. With no read of the tab yet it goes.
// A program that reports its state (`reporting`) is an agent whatever its name, as its tab's marks say
export function reviewSendBlock(
  t: Translate,
  activity: SessionActivityInfo | undefined,
  reporting = false,
): string | undefined {
  if (activity === undefined || activity.activity === 'agent') return undefined
  if (reporting && activity.activity === 'busy') return undefined
  if (activity.activity === 'idle') return t('review.send.idle')
  return activity.process
    ? t('review.send.busy', { process: activity.process })
    : t('review.send.busyUnknown')
}
