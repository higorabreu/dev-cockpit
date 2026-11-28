import {
  debPackageName,
  type ErrorBody,
  macImageName,
  type Result,
  windowsZipName,
} from '@dck/core'

export interface CommandRunner {
  // Collects the output, for a question to the system
  capture(
    command: string,
    args: readonly string[],
  ): Promise<{ readonly code: number | null; readonly stdout: string }>
  // Shares the terminal, so sudo can ask for the password and apt shows its progress
  interactive(command: string, args: readonly string[]): Promise<number | null>
}

export interface InstallRequest {
  readonly file: string
  readonly version: string
  // An older release than the installed one, asked for by name
  readonly downgrade: boolean
}

// How one kind of system installs the release file
export interface InstallTarget {
  // The release file for this system; undefined when the release workflow builds none for it
  packageName(version: string): string | undefined
  // Undefined when Dev Cockpit is not installed
  installedVersion(): Promise<string | undefined>
  install(request: InstallRequest): Promise<Result<void, ErrorBody>>
  // Where the user opens it once installed
  readonly openHint: string
}

export type SystemKind =
  | { readonly kind: 'debian' }
  | { readonly kind: 'mac' }
  | { readonly kind: 'windows' }
  | { readonly kind: 'unsupported'; readonly system: string }

// Node's names: process.platform and process.arch
export function pickSystem(platform: string, arch: string, hasApt: boolean): SystemKind {
  if (platform === 'linux') {
    if (!debPackageName('0.0.0', arch)) return { kind: 'unsupported', system: `Linux on ${arch}` }
    return hasApt
      ? { kind: 'debian' }
      : { kind: 'unsupported', system: 'Linux without apt (the .deb is for Debian and Ubuntu)' }
  }
  if (platform === 'darwin') {
    return macImageName('0.0.0', arch)
      ? { kind: 'mac' }
      : { kind: 'unsupported', system: 'Intel Mac' }
  }
  if (platform === 'win32') {
    // Windows on ARM runs the x64 build under emulation, so Node there may report either
    return windowsZipName('0.0.0', arch === 'arm64' ? 'x64' : arch)
      ? { kind: 'windows' }
      : { kind: 'unsupported', system: `Windows on ${arch}` }
  }
  return { kind: 'unsupported', system: platform }
}
