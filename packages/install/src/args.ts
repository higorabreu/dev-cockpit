import { isStable, parseSemver } from '@dck/core'

export type Command =
  | { readonly kind: 'help' }
  | { readonly kind: 'install'; readonly version?: string; readonly downloadOnly: boolean }
  | { readonly kind: 'usage'; readonly problem: string }

export const USAGE = `Usage: npx @devcockpit/install [options]

Installs the latest stable release of Dev Cockpit from GitHub, checked against the
release's SHA256SUMS.

Options:
  --version <x.y.z>  install this release instead of the latest
  --download-only    download and check the file, print where it is, install nothing
  -h, --help         show this help
`

// A release is named by its stable version, with or without the tag's leading v
function releaseVersion(text: string | undefined): string | undefined {
  const version = parseSemver(text ?? '')
  return version && isStable(version)
    ? `${version.major}.${version.minor}.${version.patch}`
    : undefined
}

export function parseArgs(argv: readonly string[]): Command {
  let version: string | undefined
  let downloadOnly = false
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? ''
    if (arg === '-h' || arg === '--help') return { kind: 'help' }
    if (arg === '--download-only') {
      downloadOnly = true
      continue
    }
    if (arg === '--version' || arg.startsWith('--version=')) {
      const value = arg === '--version' ? argv[++index] : arg.slice('--version='.length)
      version = releaseVersion(value)
      if (!version) return { kind: 'usage', problem: `not a release version: ${value ?? ''}` }
      continue
    }
    return { kind: 'usage', problem: `unknown option: ${arg}` }
  }
  return { kind: 'install', downloadOnly, ...(version ? { version } : {}) }
}
