export interface StatusLineSetting {
  readonly type: 'command'
  readonly command: string
  readonly padding?: number
  readonly refreshInterval?: number
}

export interface CommandParts {
  // Caminhos absolutos: o Claude Code roda o comando sem o ambiente do terminal do usuário
  readonly node: string
  readonly script: string
}

export type Settings = Readonly<Record<string, unknown>>

const MARKER = ' agent report --agent claude'

export const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

export function reportCommand(parts: CommandParts, forward?: string): string {
  const base = `${shellQuote(parts.node)} ${shellQuote(parts.script)}${MARKER}`
  return forward ? `${base} --forward ${shellQuote(forward)}` : base
}

export const isOurCommand = (command: string) =>
  command.includes(`${MARKER} `) || command.endsWith(MARKER)

// Devolve o comando original que o nosso encadeia, para restaurar na remoção
export function forwardedCommand(command: string): string | undefined {
  const match = /--forward '((?:[^']|'\\'')*)'$/.exec(command)
  return match?.[1]?.replace(/'\\''/g, "'")
}

function currentStatusLine(settings: Settings): StatusLineSetting | 'unsupported' | undefined {
  const value = settings.statusLine
  if (value === undefined) return undefined
  if (typeof value === 'object' && value !== null) {
    const entry = value as Record<string, unknown>
    if (entry.type === 'command' && typeof entry.command === 'string') {
      return entry as unknown as StatusLineSetting
    }
  }
  return 'unsupported'
}

export type InstallPlan =
  | { readonly kind: 'unsupported' }
  | {
      readonly kind: 'ok'
      readonly changed: boolean
      readonly next: Settings
      readonly before: StatusLineSetting | undefined
      readonly after: StatusLineSetting
      // O statusLine que o usuário já tinha e agora é encadeado
      readonly chained: string | undefined
    }

export function planInstall(settings: Settings, parts: CommandParts): InstallPlan {
  const before = currentStatusLine(settings)
  if (before === 'unsupported') return { kind: 'unsupported' }

  const existing = before && !isOurCommand(before.command) ? before.command : undefined
  const forward =
    before && isOurCommand(before.command) ? forwardedCommand(before.command) : existing
  const after: StatusLineSetting = {
    ...before,
    type: 'command',
    command: reportCommand(parts, forward),
  }
  const changed = before?.command !== after.command
  return {
    kind: 'ok',
    changed,
    next: { ...settings, statusLine: after },
    before,
    after,
    chained: forward,
  }
}

export type UninstallPlan =
  | { readonly kind: 'unsupported' }
  | {
      readonly kind: 'ok'
      readonly changed: boolean
      readonly next: Settings
      readonly before: StatusLineSetting | undefined
      readonly after: StatusLineSetting | undefined
    }

export function planUninstall(settings: Settings): UninstallPlan {
  const before = currentStatusLine(settings)
  if (before === 'unsupported') return { kind: 'unsupported' }
  if (!before || !isOurCommand(before.command)) {
    return { kind: 'ok', changed: false, next: settings, before, after: before }
  }
  const original = forwardedCommand(before.command)
  const { statusLine: _removed, ...rest } = settings
  const after = original ? ({ ...before, command: original } as StatusLineSetting) : undefined
  return {
    kind: 'ok',
    changed: true,
    next: after ? { ...rest, statusLine: after } : rest,
    before,
    after,
  }
}
