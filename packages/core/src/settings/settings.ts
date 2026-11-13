import { z } from 'zod'
import { parseServerUrl } from '../connections/url.ts'
import { EXTENSION_ID_MAX, EXTENSION_ID_PATTERN } from '../extensions/manifest.ts'

export const LANGUAGES = ['auto', 'pt-BR', 'en'] as const
export const THEMES = ['dark', 'light', 'system'] as const
export const HOLD_TRIGGERS = ['ControlRight', 'ControlLeft', 'AltRight', 'AltLeft'] as const

export const LIMITS = {
  opacity: { min: 0.3, max: 1 },
  fontSize: { min: 10, max: 32 },
  heightRatio: { min: 0.3, max: 1 },
  depth: { min: 1, max: 4 },
  notifyAfterSeconds: { min: 5, max: 600 },
  disabledExtensions: { max: 200 },
} as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// A value out of range is clamped to the limit; a wrong type goes back to the default
const bounded = (min: number, max: number, fallback: number, whole = false) =>
  z
    .number()
    .finite()
    .transform((value) => clamp(whole ? Math.round(value) : value, min, max))
    .catch(fallback)

const asObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

const section = <T extends z.ZodRawShape>(shape: T) => z.preprocess(asObject, z.object(shape))

// An entry that could never match a manifest id is dropped
const isExtensionId = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= EXTENSION_ID_MAX && EXTENSION_ID_PATTERN.test(value)

// A set kept as a sorted list: bad entries are dropped one by one instead of losing the whole list
const extensionIds = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? [...new Set(value.filter(isExtensionId))].sort().slice(0, LIMITS.disabledExtensions.max)
      : [],
  z.array(z.string()).readonly(),
)

export const settingsSchema = z.preprocess(
  asObject,
  z.object({
    language: z.enum(LANGUAGES).catch('auto'),
    theme: z.enum(THEMES).catch('dark'),
    opacity: bounded(LIMITS.opacity.min, LIMITS.opacity.max, 0.92),
    fontSize: bounded(LIMITS.fontSize.min, LIMITS.fontSize.max, 16, true),
    window: section({
      heightRatio: bounded(LIMITS.heightRatio.min, LIMITS.heightRatio.max, 0.5),
      panelOnFullHeight: z.boolean().catch(true),
    }),
    shortcuts: section({
      toggleWindow: z.string().trim().min(1).max(64).catch('F12'),
      holdTrigger: z.enum(HOLD_TRIGGERS).catch('ControlRight'),
    }),
    projects: section({
      // Undefined: uses the `projetos` folder in the home directory
      root: z.string().trim().min(1).max(1024).nullable().catch(null),
      depth: bounded(LIMITS.depth.min, LIMITS.depth.max, 2, true),
    }),
    connections: section({
      gitlab: section({
        // No default: it is the address of the user's environment. A value that is not a safe address becomes null.
        url: z
          .preprocess(
            (value) => (typeof value === 'string' ? (parseServerUrl(value) ?? null) : null),
            z.string().nullable(),
          )
          .catch(null),
      }),
    }),
    system: section({
      notifyAfterSeconds: bounded(
        LIMITS.notifyAfterSeconds.min,
        LIMITS.notifyAfterSeconds.max,
        30,
        true,
      ),
      // "Not now" on the Sessions hint turns it off; the System page turns it back on
      agentConnectHint: z.boolean().catch(true),
    }),
    extensions: section({
      // Managed by `dck ext enable` and `dck ext disable`, not by the settings screen
      disabled: extensionIds,
    }),
  }),
)

export type Settings = z.output<typeof settingsSchema>

export type DeepPartial<T> = {
  // A list is replaced as a whole, never merged by index
  readonly [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

export type SettingsPatch = DeepPartial<Settings>

// Reads anything (old, hand-edited or corrupted file) and returns valid settings
export function parseSettings(raw: unknown): Settings {
  return settingsSchema.parse(raw)
}

export const defaultSettings: Settings = parseSettings({})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch === undefined ? base : patch
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) merged[key] = deepMerge(base[key], value)
  return merged
}

export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  return parseSettings(deepMerge(current, patch))
}

// Parsing builds a new list every time, so lists are compared by content
const sameValue = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((item, index) => item === b[index])
    : a === b

// Keys (dotted) that changed between two settings, to react only to what matters
export function changedKeys(before: Settings, after: Settings): readonly string[] {
  const keys: string[] = []
  const walk = (a: unknown, b: unknown, path: string) => {
    if (isRecord(a) && isRecord(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        walk(a[key], b[key], path ? `${path}.${key}` : key)
      }
    } else if (!sameValue(a, b)) keys.push(path)
  }
  walk(before, after, '')
  return keys
}

export interface SettingsView {
  // With environment variables already applied on top: this is what the app uses
  readonly settings: Settings
  // Keys (dotted) pinned by an environment variable
  readonly locked: readonly string[]
  // There was no file: first run, when it is worth importing the old preferences
  readonly fresh: boolean
}

export interface SettingsUpdate extends SettingsView {
  // Keys whose change was refused, for example a shortcut another program already uses
  readonly rejected: readonly string[]
}
