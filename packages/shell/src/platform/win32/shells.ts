import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { win32 } from 'node:path'
import { type TerminalShell, wslShellId } from '@dck/core'

const { join, resolve } = win32

export interface ShellProbe {
  readonly env: Readonly<Record<string, string | undefined>>
  exists(path: string): boolean
}

// A copy of process.env loses Windows' case-insensitive names: Path is the usual spelling
const pathOf = (env: ShellProbe['env']) => env.PATH ?? env.Path ?? ''

function onPath(probe: ShellProbe, program: string): string | undefined {
  for (const folder of pathOf(probe.env).split(';')) {
    const candidate = folder.trim() && join(folder.trim(), program)
    if (candidate && probe.exists(candidate)) return candidate
  }
  return undefined
}

const firstExisting = (probe: ShellProbe, candidates: readonly (string | undefined)[]) =>
  candidates.find((candidate) => candidate !== undefined && probe.exists(candidate))

// Git for Windows puts git.exe in cmd\ (or bin\, or mingw64\bin\) and bash.exe in bin\. System32's
// bash.exe is WSL's, so only bash beside git counts
function gitBash(probe: ShellProbe): string | undefined {
  const git = onPath(probe, 'git.exe')
  const programFiles = probe.env.ProgramFiles
  return firstExisting(probe, [
    git && resolve(git, '..', '..', 'bin', 'bash.exe'),
    git && resolve(git, '..', '..', '..', 'bin', 'bash.exe'),
    programFiles && join(programFiles, 'Git', 'bin', 'bash.exe'),
  ])
}

const systemRoot = (env: ShellProbe['env']) => env.SystemRoot ?? env.windir ?? 'C:\\Windows'

// Found without starting a process, so the first tab knows its shell at once; WSL is listed apart
export function detectWindowsShells(probe: ShellProbe): readonly TerminalShell[] {
  const system32 = join(systemRoot(probe.env), 'System32')
  const found = {
    pwsh: firstExisting(probe, [
      onPath(probe, 'pwsh.exe'),
      probe.env.ProgramFiles && join(probe.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'),
    ]),
    powershell: firstExisting(probe, [
      join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ]),
    gitBash: gitBash(probe),
    cmd: firstExisting(probe, [probe.env.ComSpec, join(system32, 'cmd.exe')]),
  }
  const shells: TerminalShell[] = []
  if (found.pwsh) shells.push({ id: 'pwsh', kind: 'pwsh', file: found.pwsh, args: ['-NoLogo'] })
  if (found.powershell)
    shells.push({ id: 'powershell', kind: 'powershell', file: found.powershell, args: ['-NoLogo'] })
  // A login shell reads ~/.bash_profile, as Git Bash's own window does
  if (found.gitBash)
    shells.push({ id: 'gitBash', kind: 'gitBash', file: found.gitBash, args: ['--login', '-i'] })
  if (found.cmd) shells.push({ id: 'cmd', kind: 'cmd', file: found.cmd, args: [] })
  return shells
}

// Docker Desktop's own distributions hold no shell for the user
const isUserDistribution = (name: string) => !name.toLowerCase().startsWith('docker-desktop')

const wslShell = (name: string, env: ShellProbe['env']): TerminalShell => ({
  id: wslShellId(name),
  kind: 'wsl',
  name,
  file: join(systemRoot(env), 'System32', 'wsl.exe'),
  args: ['-d', name],
})

// A chosen distribution starts from its id, so a tab never waits for wsl.exe to list them
export function chosenWslShell(
  chosen: string | null,
  probe: ShellProbe,
): TerminalShell | undefined {
  const name = chosen?.startsWith('wsl:') ? chosen.slice('wsl:'.length) : ''
  const shell = name ? wslShell(name, probe.env) : undefined
  return shell && probe.exists(shell.file) ? shell : undefined
}

// `wsl.exe -l -q` prints UTF-16LE, one distribution per line, with a BOM on some builds
export function wslShells(output: Buffer, env: ShellProbe['env']): readonly TerminalShell[] {
  return output
    .toString('utf16le')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.replaceAll('\0', '').trim())
    .filter((name) => name !== '' && isUserDistribution(name))
    .map((name) => wslShell(name, env))
}

// Undefined when WSL is not installed: wsl.exe then prints how to install it and exits with an error
export function listWslDistributions(env: ShellProbe['env']): Promise<Buffer | undefined> {
  const wsl = join(systemRoot(env), 'System32', 'wsl.exe')
  return new Promise((done) => {
    execFile(
      wsl,
      ['-l', '-q'],
      { encoding: 'buffer', timeout: 3000, windowsHide: true },
      (error, stdout) => done(error ? undefined : stdout),
    )
  })
}

export function windowsShells(env: ShellProbe['env']) {
  const probe: ShellProbe = { env, exists: existsSync }
  return {
    // Checked at each new tab, a few file checks, so a shell installed since the start is found
    installed(chosen: string | null): readonly TerminalShell[] {
      const wsl = chosenWslShell(chosen, probe)
      return [...detectWindowsShells(probe), ...(wsl ? [wsl] : [])]
    },
    async list(): Promise<readonly TerminalShell[]> {
      const output = await listWslDistributions(env)
      return [...detectWindowsShells(probe), ...(output ? wslShells(output, env) : [])]
    },
  }
}
