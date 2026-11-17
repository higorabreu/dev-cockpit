import type { SettingsEdit } from '../ports/settings-text.ts'
import { changedPaths, type Settings } from './settings.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const valueAt = (source: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), source)

// What to write so the file holds `after` where it changed from `before`. Where the file has something
// other than an object on the way (`"system": 5`), the whole value from that point on is written
export function settingsEdits(
  raw: unknown,
  before: Settings,
  after: Settings,
): readonly SettingsEdit[] {
  const edits = new Map<string, SettingsEdit>()
  for (const path of changedPaths(before, after)) {
    let cut = path.length
    let node = raw
    for (const [index, key] of path.slice(0, -1).entries()) {
      node = isRecord(node) ? node[key] : undefined
      if (node !== undefined && !isRecord(node)) {
        cut = index + 1
        break
      }
    }
    const target = path.slice(0, cut)
    edits.set(JSON.stringify(target), { path: target, value: valueAt(after, target) })
  }
  return [...edits.values()]
}
