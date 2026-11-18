import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  errorBody,
  fail,
  type Logger,
  ok,
  type ReleaseAsset,
  type UpdateInstaller,
} from '@dck/core'

// SHA256SUMS lists a few files; anything near this size is not that file
const MAX_TEXT_BYTES = 64 * 1024
const TEXT_TIMEOUT_MS = 30_000
// The package is about a hundred megabytes; a slow line still finishes, a stalled one gives up
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000
const FOLDER_PREFIX = 'dev-cockpit-update-'
// A release file name goes into a path, so only plain names pass
const SAFE_NAME = /^[A-Za-z0-9._+-]+$/
// pkexec's own exit code when the user dismissed the password dialog
const DIALOG_DISMISSED = 126

export interface CommandResult {
  readonly code: number | null
  readonly stderr: string
}

export interface DebInstallerDeps {
  readonly fetch: typeof fetch
  // Runs a program without a shell
  run(command: string, args: readonly string[]): Promise<CommandResult>
  // The system's temporary folder
  readonly tempRoot: string
  readonly userAgent: string
  readonly logger: Logger
}

const lastLine = (text: string) => text.trim().split('\n').at(-1)?.slice(0, 200) ?? ''

// Downloads the release's .deb, hashing it on the way, and installs it as root through polkit
export function createDebInstaller(deps: DebInstallerDeps): UpdateInstaller {
  const headers = { 'user-agent': deps.userAgent }
  const ours = (file: string) => {
    const folder = dirname(file)
    return dirname(folder) === deps.tempRoot && basename(folder).startsWith(FOLDER_PREFIX)
  }

  return {
    async readText(url) {
      try {
        const response = await deps.fetch(url, {
          headers,
          signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
        })
        if (!response.ok) return fail(errorBody('DCK-UPD-004', `HTTP ${response.status}`))
        const text = await response.text()
        if (text.length > MAX_TEXT_BYTES) return fail(errorBody('DCK-UPD-004', 'text too large'))
        return ok(text)
      } catch (error) {
        return fail(errorBody('DCK-UPD-004', String(error)))
      }
    },

    async download(asset: ReleaseAsset, onProgress) {
      if (!SAFE_NAME.test(asset.name)) return fail(errorBody('DCK-UPD-004', 'unsafe file name'))
      let folder: string | undefined
      try {
        folder = await mkdtemp(join(deps.tempRoot, FOLDER_PREFIX))
        const file = join(folder, asset.name)
        const response = await deps.fetch(asset.url, {
          headers,
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        })
        if (!response.ok || !response.body) {
          await rm(folder, { recursive: true, force: true })
          return fail(errorBody('DCK-UPD-004', `HTTP ${response.status}`))
        }
        const total = Number(response.headers.get('content-length')) || asset.size
        const hash = createHash('sha256')
        let received = 0
        const meter = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            hash.update(chunk)
            received += chunk.length
            if (total > 0) onProgress(Math.min(1, received / total))
            done(null, chunk)
          },
        })
        await pipeline(
          Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
          meter,
          createWriteStream(file, { mode: 0o600 }),
        )
        return ok({ file, sha256: hash.digest('hex') })
      } catch (error) {
        if (folder) await rm(folder, { recursive: true, force: true })
        return fail(errorBody('DCK-UPD-004', String(error)))
      }
    },

    // apt resolves the package's dependencies; polkit shows the system's password dialog
    async install(file) {
      if (!ours(file)) return fail(errorBody('DCK-UPD-006', 'file outside the update folder'))
      const result = await deps
        .run('pkexec', ['/usr/bin/apt-get', 'install', '-y', file])
        .catch((error: unknown) => ({ code: null, stderr: String(error) }))
      if (result.code === 0) return ok('installed')
      if (result.code === DIALOG_DISMISSED) return ok('cancelled')
      deps.logger.warn('update install command failed', {
        code: result.code,
        stderr: lastLine(result.stderr),
      })
      return fail(errorBody('DCK-UPD-006', `exit ${result.code}`))
    },

    async discard(file) {
      if (!ours(file)) return
      await rm(dirname(file), { recursive: true, force: true }).catch((error: unknown) =>
        deps.logger.warn('update file not removed', { file, error: String(error) }),
      )
    },
  }
}
