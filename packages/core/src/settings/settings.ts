import { z } from 'zod'

export const LANGUAGES = ['auto', 'pt-BR', 'en'] as const
export const THEMES = ['dark', 'light', 'system'] as const
export const HOLD_TRIGGERS = ['ControlRight', 'ControlLeft', 'AltRight', 'AltLeft'] as const

export const LIMITS = {
  opacity: { min: 0.3, max: 1 },
  fontSize: { min: 10, max: 32 },
  heightRatio: { min: 0.3, max: 1 },
  depth: { min: 1, max: 4 },
  notifyAfterSeconds: { min: 5, max: 600 },
} as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Valor fora do intervalo é cortado no limite; tipo errado volta ao padrão
const bounded = (min: number, max: number, fallback: number, whole = false) =>
  z
    .number()
    .finite()
    .transform((value) => clamp(whole ? Math.round(value) : value, min, max))
    .catch(fallback)

const asObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

const section = <T extends z.ZodRawShape>(shape: T) => z.preprocess(asObject, z.object(shape))

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
      // Indefinida: usa a pasta `projetos` da home
      root: z.string().trim().min(1).max(1024).nullable().catch(null),
      depth: bounded(LIMITS.depth.min, LIMITS.depth.max, 2, true),
    }),
    system: section({
      notifyAfterSeconds: bounded(
        LIMITS.notifyAfterSeconds.min,
        LIMITS.notifyAfterSeconds.max,
        30,
        true,
      ),
    }),
  }),
)

export type Settings = z.output<typeof settingsSchema>

export type DeepPartial<T> = {
  readonly [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export type SettingsPatch = DeepPartial<Settings>

// Lê qualquer coisa (arquivo velho, editado à mão, corrompido) e devolve configurações válidas
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

// Chaves (com ponto) que mudaram entre duas configurações, para reagir só ao que importa
export function changedKeys(before: Settings, after: Settings): readonly string[] {
  const keys: string[] = []
  const walk = (a: unknown, b: unknown, path: string) => {
    if (isRecord(a) && isRecord(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        walk(a[key], b[key], path ? `${path}.${key}` : key)
      }
    } else if (a !== b) keys.push(path)
  }
  walk(before, after, '')
  return keys
}
