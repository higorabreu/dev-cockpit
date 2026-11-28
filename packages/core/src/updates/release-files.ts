import type { Release, ReleaseAsset } from '../ports/updates.ts'

export const CHECKSUMS_FILE = 'SHA256SUMS'

// Node's names for the processor, as the release workflow names the packages
const DEB_ARCHITECTURES: Readonly<Record<string, string>> = { x64: 'amd64', arm64: 'arm64' }

// The .deb the release workflow builds for this processor; undefined for one it does not build
export function debPackageName(version: string, arch: string): string | undefined {
  const deb = DEB_ARCHITECTURES[arch]
  return deb ? `dev-cockpit_${version}_${deb}.deb` : undefined
}

// The Mac image the release workflow builds, named with Node's name for the processor; Apple Silicon only
export function macImageName(version: string, arch: string): string | undefined {
  return arch === 'arm64' ? `dev-cockpit_${version}_${arch}.dmg` : undefined
}

// The Windows zip package-win.mjs builds; x64 only, Windows on ARM runs it under emulation
export function windowsZipName(version: string, arch: string): string | undefined {
  return arch === 'x64' ? `dev-cockpit_${version}_win32-x64.zip` : undefined
}

// `sha256sum` writes `<hash>  <name>`, or `<hash> *<name>` in binary mode; any other line is skipped
const CHECKSUM_LINE = /^([0-9a-fA-F]{64}) [ *](.+)$/

export function parseChecksums(text: string): ReadonlyMap<string, string> {
  const sums = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = CHECKSUM_LINE.exec(line.trim())
    if (match?.[1] && match[2]) sums.set(match[2], match[1].toLowerCase())
  }
  return sums
}

export interface ReleaseFiles {
  readonly package: ReleaseAsset
  readonly checksums: ReleaseAsset
}

// The named package and the checksums beside it; both, or nothing to install
export function releaseFiles(release: Release, name: string | undefined): ReleaseFiles | undefined {
  const found = release.assets.find((asset) => asset.name === name)
  const checksums = release.assets.find((asset) => asset.name === CHECKSUMS_FILE)
  return found && checksums ? { package: found, checksums } : undefined
}
