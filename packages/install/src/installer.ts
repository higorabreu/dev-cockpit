import {
  compareSemver,
  describeError,
  type ErrorBody,
  errorBody,
  errorCodeOf,
  fail,
  ok,
  parseChecksums,
  parseSemver,
  type Release,
  type Result,
  releaseFiles,
  type UpdateInstaller,
} from '@dck/core'
import type { InstallTarget } from './system.ts'

export interface InstallOptions {
  // A release named by the user; the latest stable one otherwise
  readonly version?: string
  // Stops after the checksum and keeps the file
  readonly downloadOnly: boolean
}

type ReleaseReply = Promise<Result<Release | undefined, ErrorBody>>

export interface InstallerDeps {
  readonly releases: { latest(): ReleaseReply; tagged(version: string): ReleaseReply }
  readonly files: Pick<UpdateInstaller, 'readText' | 'download' | 'discard'>
  readonly target: InstallTarget | { readonly unsupported: string }
  out(line: string): void
}

// The reused parts speak of updates; the installer keeps their detail under its own message
function detailOf(error: ErrorBody): string {
  const prefix = `${describeError(errorCodeOf(error))}: `
  return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message
}

// Negative when `a` is older; versions that do not parse count as equal
function compareVersions(a: string, b: string): number {
  const left = parseSemver(a)
  const right = parseSemver(b)
  return left && right ? compareSemver(left, right) : 0
}

const megabytes = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`

// Finds the release, downloads its file for this system, checks it against SHA256SUMS and installs it
export async function runInstaller(
  options: InstallOptions,
  deps: InstallerDeps,
): Promise<Result<void, ErrorBody>> {
  const { target, files, out } = deps
  if ('unsupported' in target) return fail(errorBody('DCK-INS-001', target.unsupported))

  const found = await (options.version
    ? deps.releases.tagged(options.version)
    : deps.releases.latest())
  if (!found.ok) return fail(errorBody('DCK-INS-002', detailOf(found.error)))
  const release = found.value
  if (!release) return fail(errorBody('DCK-INS-003', options.version ?? 'no stable release'))
  const { version } = release

  const installed = options.downloadOnly ? undefined : await target.installedVersion()
  if (installed !== undefined && compareVersions(installed, version) === 0) {
    out(`Dev Cockpit ${version} is already installed.`)
    return ok(undefined)
  }
  if (installed !== undefined && !options.version && compareVersions(installed, version) > 0) {
    out(`Dev Cockpit ${installed} is installed, newer than the latest release ${version}.`)
    return ok(undefined)
  }

  const name = target.packageName(version)
  const chosen = releaseFiles(release, name)
  if (!chosen) return fail(errorBody('DCK-UPD-003', `no ${name} in release ${version}`))
  const sums = await files.readText(chosen.checksums.url)
  if (!sums.ok) return fail(errorBody('DCK-INS-004', detailOf(sums.error)))
  const expected = parseChecksums(sums.value).get(chosen.package.name)
  if (!expected) return fail(errorBody('DCK-UPD-003', `no checksum for ${chosen.package.name}`))

  out(
    `Downloading Dev Cockpit ${version} (${chosen.package.name}, ${megabytes(chosen.package.size)}).`,
  )
  const downloaded = await files.download(chosen.package, () => {})
  if (!downloaded.ok) return fail(errorBody('DCK-INS-004', detailOf(downloaded.error)))
  const { file, sha256 } = downloaded.value
  if (sha256.toLowerCase() !== expected) {
    await files.discard(file)
    return fail(
      errorBody('DCK-INS-005', `${chosen.package.name} expected ${expected} got ${sha256}`),
    )
  }
  out('Checksum verified (SHA-256).')

  if (options.downloadOnly) {
    out(`Downloaded to ${file}; nothing was installed.`)
    return ok(undefined)
  }
  const downgrade = installed !== undefined && compareVersions(version, installed) < 0
  let result: Result<void, ErrorBody>
  try {
    result = await target.install({ file, version, downgrade })
  } finally {
    await files.discard(file)
  }
  if (!result.ok) return result
  out(`Dev Cockpit ${version} is installed. ${target.openHint}.`)
  return ok(undefined)
}
