import type { SettingsEdit } from '../ports/settings-text.ts'
import { previewValue } from './preview-value.ts'
import { changedPaths, defaultSettings, type Settings } from './settings.ts'

export { previewValue }

// Why a value in the file is not used as it was written
export type SettingsIssueKind =
  // Not valid: the default is used
  | 'ignored'
  // Not valid, and there is nothing in its place (an entry of a list or of a map)
  | 'dropped'
  // Corrected to fit: clamped to a limit, rounded, trimmed or without its bad entries
  | 'adjusted'
  // No setting has this name
  | 'unknown'
  // The system refused it (a shortcut another program owns); the previous value stays
  | 'refused'
  // A folder that does not exist; it is kept as written
  | 'missingFolder'

export interface SettingsIssue {
  // Dotted, as the user finds it in the file
  readonly key: string
  readonly kind: SettingsIssueKind
  // Short texts of the value written and of the value in use, as JSON shows them
  readonly found: string
  readonly used?: string
}

export type SettingsFileState =
  | { readonly kind: 'ok'; readonly issues: readonly SettingsIssue[] }
  // Not JSON with comments: the settings in use stay the last good ones and nothing writes the file
  | { readonly kind: 'invalid'; readonly line: number; readonly column: number }

export const settingsFileOk: SettingsFileState = { kind: 'ok', issues: [] }

// Where the host keeps settings.json, so the window opens it in a tab of its own at that folder
export interface SettingsFileLocation {
  readonly path: string
  readonly folder: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// The settings keep a list as a sorted set, so order and repeats are not a change
const sameList = (a: readonly unknown[], b: readonly unknown[]) => {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every((item) => right.has(item))
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? sameList(a, b) : a === b

function kindOf(found: unknown, used: unknown, fallback: unknown): SettingsIssueKind {
  if (used === undefined) return 'dropped'
  if (typeof found === 'number' && typeof used === 'number') return 'adjusted'
  if (Array.isArray(found) && Array.isArray(used)) return 'adjusted'
  if (typeof found === 'string' && typeof used === 'string' && used !== fallback) return 'adjusted'
  return 'ignored'
}

// What the file holds (`raw`) against what the model made of it, value by value
export function settingsIssues(raw: unknown, settings: Settings): readonly SettingsIssue[] {
  const issues: SettingsIssue[] = []
  const walk = (found: unknown, used: unknown, fallback: unknown, path: readonly string[]) => {
    const key = path.join('.')
    if (found === undefined) return
    if (isRecord(used)) {
      if (!isRecord(found)) {
        issues.push({ key, kind: 'ignored', found: previewValue(found), used: previewValue(used) })
        return
      }
      // A map (connections, review bases) starts empty, a group of settings never does
      const isMap = isRecord(fallback) && Object.keys(fallback).length === 0
      for (const [name, value] of Object.entries(found)) {
        const child = [...path, name]
        if (name in used)
          walk(value, used[name], isRecord(fallback) ? fallback[name] : undefined, child)
        else
          issues.push({
            key: child.join('.'),
            kind: isMap ? 'dropped' : 'unknown',
            found: previewValue(value),
          })
      }
      return
    }
    if (same(found, used)) return
    const kind = kindOf(found, used, fallback)
    issues.push(
      kind === 'dropped'
        ? { key, kind, found: previewValue(found) }
        : { key, kind, found: previewValue(found), used: previewValue(used) },
    )
  }
  walk(raw, settings, defaultSettings, [])
  return issues
}

const valueAt = (source: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), source)

// The values a patch sets, each by its path of keys
export function patchPaths(patch: unknown, path: readonly string[] = []): readonly string[][] {
  if (!isRecord(patch)) return [[...path]]
  return Object.entries(patch).flatMap(([key, value]) => patchPaths(value, [...path, key]))
}

// What to write so the file holds `after` where it changed from `before`, and where a value the user set
// (`touched`) is written otherwise in the file, so a reset puts right a value the model had replaced.
// Where the file has something other than an object on the way (`"system": 5`), the whole value from that
// point on is written
export function settingsEdits(
  raw: unknown,
  before: Settings,
  after: Settings,
  touched: readonly (readonly string[])[] = [],
): readonly SettingsEdit[] {
  const edits = new Map<string, SettingsEdit>()
  const wrongInFile = touched.filter((path) => {
    const written = valueAt(raw, path)
    return written !== undefined && !same(written, valueAt(after, path))
  })
  for (const path of [...changedPaths(before, after), ...wrongInFile]) {
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

export const sameFileState = (a: SettingsFileState, b: SettingsFileState) =>
  JSON.stringify(a) === JSON.stringify(b)
