import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { errorBody, fail, type Logger, ok, type UpdateInstaller } from '@dck/core'

// SHA256SUMS lists a few files; anything near this size is not that file
const MAX_TEXT_BYTES = 64 * 1024
const TEXT_TIMEOUT_MS = 30_000
// A package is about a hundred megabytes; a slow line still finishes, a stalled one gives up
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000
// A release file name goes into a path, so only plain names pass
const SAFE_NAME = /^[A-Za-z0-9._+-]+$/

export interface ReleaseDownloadDeps {
  readonly fetch: typeof fetch
  // The system's temporary folder
  readonly tempRoot: string
  // Each download gets its own new folder under the temporary one, named with this prefix
  readonly folderPrefix: string
  readonly userAgent: string
  readonly logger: Logger
}

export type ReleaseDownload = Pick<UpdateInstaller, 'readText' | 'download' | 'discard'> & {
  // True for a file this downloader saved, so nothing else is installed or removed
  owns(file: string): boolean
}

// Reads a release's small files and downloads its packages to a private folder, hashing them on the way
export function createReleaseDownload(deps: ReleaseDownloadDeps): ReleaseDownload {
  const headers = { 'user-agent': deps.userAgent }
  const owns = (file: string) => {
    const folder = dirname(file)
    return dirname(folder) === deps.tempRoot && basename(folder).startsWith(deps.folderPrefix)
  }

  return {
    owns,

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

    async download(asset, onProgress) {
      if (!SAFE_NAME.test(asset.name)) return fail(errorBody('DCK-UPD-004', 'unsafe file name'))
      let folder: string | undefined
      try {
        folder = await mkdtemp(join(deps.tempRoot, deps.folderPrefix))
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

    async discard(file) {
      if (!owns(file)) return
      await rm(dirname(file), { recursive: true, force: true }).catch((error: unknown) =>
        deps.logger.warn('release file not removed', { file, error: String(error) }),
      )
    },
  }
}
