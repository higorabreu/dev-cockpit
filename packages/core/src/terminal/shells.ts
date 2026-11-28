// The shells a new tab can start, as the system offers them; for now only Windows lists any, since Linux and
// macOS follow the user's own $SHELL
export const SHELL_KINDS = ['pwsh', 'powershell', 'gitBash', 'cmd', 'wsl'] as const
export type ShellKind = (typeof SHELL_KINDS)[number]

// What the settings screen shows: `name` is the WSL distribution, the label comes from the catalog
export interface ShellChoice {
  readonly id: string
  readonly kind: ShellKind
  readonly name?: string
}

export interface TerminalShell extends ShellChoice {
  readonly file: string
  readonly args: readonly string[]
}

export interface ShellCommand {
  readonly file: string
  readonly args: readonly string[]
}

export const wslShellId = (distribution: string) => `wsl:${distribution}`

export const shellChoice = ({ id, kind, name }: TerminalShell): ShellChoice =>
  name === undefined ? { id, kind } : { id, kind, name }

// The chosen shell while it is still installed, else the first one found, else the platform's default; a
// shell uninstalled since it was chosen must not leave the tabs without a terminal
export function chooseShell(
  chosen: string | null,
  shells: readonly TerminalShell[],
  fallback: ShellCommand,
): ShellCommand {
  const shell = shells.find((each) => each.id === chosen) ?? shells[0]
  return shell ? { file: shell.file, args: shell.args } : fallback
}
