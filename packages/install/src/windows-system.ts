import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path/win32'
import type { PathChange, WindowsSystem } from './windows.ts'

// Paths reach the scripts through the environment and the script as base64, so no quoting can break them
export function runPowerShell(
  script: string,
  env: Readonly<Record<string, string>>,
): Promise<{ readonly code: number | null; readonly stdout: string }> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encoded,
  ]
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      args,
      { env: { ...process.env, ...env }, windowsHide: true, timeout: 60_000 },
      (error, stdout) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0
        resolve({ code, stdout: String(stdout).trim() })
      },
    )
  })
}

// The window and the daemon run from the app folder; waiting lets Windows release their files
const STOP_SCRIPT = `
$folder = $env:DCK_FOLDER.TrimEnd('\\') + '\\'
$running = @(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($folder, 'OrdinalIgnoreCase') })
$running | Stop-Process -Force -ErrorAction SilentlyContinue
$running | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
$running.Count
`

const SHORTCUT_SCRIPT = `
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($env:DCK_LINK)
$shortcut.TargetPath = $env:DCK_TARGET
$shortcut.WorkingDirectory = Split-Path -Parent $env:DCK_TARGET
$shortcut.Save()
`

// Read and written raw, so an entry like %USERPROFILE%\bin keeps its variable, and in the value's own kind.
// setx would cut the PATH at 1024 characters. The broadcast tells Explorer, so new terminals see the change
export const USER_PATH_SCRIPT = `
$key = if ($env:DCK_ENV_KEY) { $env:DCK_ENV_KEY } else { 'HKCU:\\Environment' }
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
$item = Get-Item $key
$raw = $item.GetValue('Path', '', 'DoNotExpandEnvironmentNames')
$entries = @($raw -split ';' | Where-Object { $_ -ne '' } | ForEach-Object { $_.TrimEnd('\\') })
if ($entries -contains $env:DCK_BIN.TrimEnd('\\')) { 'present'; exit 0 }
$kind = if ($raw -eq '') { 'ExpandString' } else { $item.GetValueKind('Path') }
$value = if ($raw -eq '') { $env:DCK_BIN } else { $raw.TrimEnd(';') + ';' + $env:DCK_BIN }
Set-ItemProperty -Path $key -Name Path -Value $value -Type $kind
Add-Type -Namespace Dck -Name Native -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);'
$result = [UIntPtr]::Zero
[Dck.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) | Out-Null
'added'
`

// System32's bsdtar reads zips; Git's GNU tar, often first on the PATH, does not
const tar = () => join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')

export function createWindowsSystem(environmentKey?: string): WindowsSystem {
  return {
    readText: (path) => readFile(path, 'utf8').catch(() => undefined),
    exists: (path) =>
      stat(path).then(
        () => true,
        () => false,
      ),
    // The daemon just stopped may hold a file for a moment
    remove: (path) =>
      rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).then(
        () => true,
        () => false,
      ),
    rename: (from, to) =>
      rename(from, to).then(
        () => true,
        () => false,
      ),
    mkdir: async (path) => {
      await mkdir(path, { recursive: true })
    },
    async stopRunning(folder) {
      const { stdout } = await runPowerShell(STOP_SCRIPT, { DCK_FOLDER: folder })
      return Number.parseInt(stdout, 10) || 0
    },
    async unpack(zip, into) {
      await mkdir(into, { recursive: true })
      return new Promise((resolve) => {
        execFile(tar(), ['-x', '-f', zip, '-C', into], { windowsHide: true }, (error) =>
          resolve(!error),
        )
      })
    },
    async shortcut(link, target) {
      // A new account may not have its Start menu's Programs folder yet
      await mkdir(dirname(link), { recursive: true })
      const { code } = await runPowerShell(SHORTCUT_SCRIPT, { DCK_LINK: link, DCK_TARGET: target })
      return code === 0
    },
    async addToUserPath(folder): Promise<PathChange> {
      const { code, stdout } = await runPowerShell(USER_PATH_SCRIPT, {
        DCK_BIN: folder,
        ...(environmentKey ? { DCK_ENV_KEY: environmentKey } : {}),
      })
      if (code !== 0) return 'failed'
      if (stdout.endsWith('present')) return 'present'
      return stdout.endsWith('added') ? 'added' : 'failed'
    },
  }
}
