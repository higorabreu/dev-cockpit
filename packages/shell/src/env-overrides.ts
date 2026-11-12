import { mergeSettings, type Settings } from '@dck/core'

export interface OverrideResult {
  readonly settings: Settings
  // Keys (dotted) that an environment variable is pinning; the screen shows them as locked
  readonly locked: readonly string[]
}

// DCK_* variables still apply and win over the file: they serve tests, CI and whoever prefers
export function applyEnvOverrides(
  settings: Settings,
  env: Readonly<Record<string, string | undefined>>,
): OverrideResult {
  let result = settings
  const locked: string[] = []
  const lock = (key: string) => locked.push(key)

  if (env.DCK_KEY) {
    result = mergeSettings(result, { shortcuts: { toggleWindow: env.DCK_KEY } })
    lock('shortcuts.toggleWindow')
  }
  const height = Number(env.DCK_HEIGHT)
  if (env.DCK_HEIGHT && Number.isFinite(height) && height > 0) {
    result = mergeSettings(result, { window: { heightRatio: height } })
    lock('window.heightRatio')
  }
  if (env.DCK_PROJECTS_ROOT) {
    result = mergeSettings(result, { projects: { root: env.DCK_PROJECTS_ROOT } })
    lock('projects.root')
  }
  return { settings: result, locked }
}
