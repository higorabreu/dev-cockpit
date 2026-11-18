// A release version as semver 2.0.0 orders it; build metadata is read and ignored
export interface Semver {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly (string | number)[]
}

const IDENTIFIER = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)'
const SEMVER = new RegExp(
  `^v?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)` +
    `(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
)

// A release tag carries a leading `v` (v0.10.0); the version without it parses the same
export function parseSemver(text: string): Semver | undefined {
  const match = SEMVER.exec(text.trim())
  if (!match) return undefined
  const prerelease = match[4]
    ? match[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : []
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease }
}

export const isStable = (version: Semver): boolean => version.prerelease.length === 0

// Numbers sort below words, and a shorter list of equal parts sorts first (semver 11.4)
function comparePrerelease(a: Semver['prerelease'], b: Semver['prerelease']): number {
  if (a.length === 0 || b.length === 0) return b.length - a.length
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const left = a[index]
    const right = b[index]
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue
    if (typeof left === 'number' && typeof right === 'number') return left - right
    if (typeof left === 'number') return -1
    if (typeof right === 'number') return 1
    return left < right ? -1 : 1
  }
  return 0
}

// Negative when `a` comes before `b`, zero when they are the same release
export function compareSemver(a: Semver, b: Semver): number {
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch ||
    comparePrerelease(a.prerelease, b.prerelease)
  )
}

// False when either is not a version: an unreadable tag never offers an update
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseSemver(candidate)
  const running = parseSemver(current)
  return next !== undefined && running !== undefined && compareSemver(next, running) > 0
}
