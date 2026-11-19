import { createHash, randomBytes } from 'node:crypto'
import { realpathSync, watch } from 'node:fs'
import {
  access,
  constants,
  type FileHandle,
  open,
  realpath,
  rename,
  stat,
  unlink,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  type ErrorBody,
  errorBody,
  FILE_LIMITS,
  type FileBytes,
  type FileStamp,
  type FileStore,
  fail,
  type Logger,
  ok,
  type Result,
  sameContent,
  saveStep,
  silentLogger,
} from '@dck/core'

export interface FolderWatcher {
  close(): void
}

export interface NodeFileStoreOptions {
  // `fs.watch` on a folder: a writer that renames a new file over the watched one ends a watch on the file
  readonly watchFolder?: (
    folder: string,
    onChange: (name: string | null) => void,
    onError: (error: unknown) => void,
  ) => FolderWatcher
  // One save is a write and a rename, an agent's often several: a burst becomes one check
  readonly settleMs?: number
  readonly logger?: Logger
}

// A new file, written when the user keeps their text over a deleted one
const NEW_FILE_MODE = 0o644
const SETTLE_MS = 100

const nodeWatchFolder: NonNullable<NodeFileStoreOptions['watchFolder']> = (
  folder,
  onChange,
  onError,
) => {
  const watcher = watch(folder, (_event, name) => onChange(name === null ? null : String(name)))
  watcher.on('error', onError)
  return watcher
}

const codeOf = (error: unknown) =>
  (error as { code?: unknown } | undefined)?.code?.toString() ?? String(error)

const MISSING = new Set(['ENOENT', 'ENOTDIR'])

function readFailure(path: string, error: unknown): ErrorBody {
  const code = codeOf(error)
  return errorBody(MISSING.has(code) ? 'DCK-FIL-001' : 'DCK-FIL-002', `${path}: ${code}`)
}

// A file past the open limit is never read whole: its size and time stand for its content
const unreadStamp = (size: number, mtimeMs: number): FileStamp => ({
  size,
  mtimeMs,
  hash: `unread:${size}:${mtimeMs}`,
})

function stampOf(bytes: Uint8Array, mtimeMs: number): FileStamp {
  if (bytes.length > FILE_LIMITS.openBytes) return unreadStamp(bytes.length, mtimeMs)
  const hash = createHash('sha256').update(bytes).digest('hex')
  return { size: bytes.length, mtimeMs, hash }
}

// Through one handle, so what it tells is about the file it opened, even if another one is renamed over it
async function withFile<T>(
  path: string,
  use: (handle: FileHandle, size: number, mtimeMs: number) => Promise<T>,
): Promise<Result<T, ErrorBody>> {
  let handle: FileHandle | undefined
  try {
    handle = await open(path, 'r')
    const info = await handle.stat()
    if (!info.isFile()) return fail(errorBody('DCK-FIL-002', `${path}: not a regular file`))
    return ok(await use(handle, info.size, info.mtimeMs))
  } catch (error) {
    return fail(readFailure(path, error))
  } finally {
    await handle?.close()
  }
}

const readBytes = (path: string) =>
  withFile<FileBytes>(path, async (handle, _size, mtimeMs) => {
    const bytes = await handle.readFile()
    return { bytes, stamp: stampOf(bytes, mtimeMs) }
  })

// What the disk holds now; undefined when there is no file at the path
async function diskStamp(path: string): Promise<Result<FileStamp | undefined, ErrorBody>> {
  const stamp = await withFile(path, async (handle, size, mtimeMs) =>
    size > FILE_LIMITS.openBytes
      ? unreadStamp(size, mtimeMs)
      : stampOf(await handle.readFile(), mtimeMs),
  )
  if (!stamp.ok && stamp.error.data?.code === 'DCK-FIL-001') return ok(undefined)
  return stamp
}

const sameDisk = (left: FileStamp | undefined, right: FileStamp | undefined) =>
  left === undefined || right === undefined ? left === right : sameContent(left, right)

const STEADY_TRIES = 5

// A writer that truncates and then writes shows an empty file for a moment: what the disk holds counts
// once two reads a pause apart agree
async function steadyStamp(
  path: string,
  first: Result<FileStamp | undefined, ErrorBody>,
  pauseMs: number,
): Promise<Result<FileStamp | undefined, ErrorBody>> {
  let last = first
  for (let tries = 0; tries < STEADY_TRIES && last.ok; tries++) {
    await delay(pauseMs)
    const next = await diskStamp(path)
    if (next.ok && last.ok && sameDisk(last.value, next.value)) return next
    last = next
  }
  return last
}

async function writeThrough(handle: FileHandle, bytes: Uint8Array, mode: number | undefined) {
  await handle.writeFile(bytes)
  if (mode !== undefined) await handle.chmod(mode)
  await handle.sync()
}

// Written whole beside the file, then renamed over it: a reader sees the old file or the new one
async function replace(target: string, bytes: Uint8Array, mode: number) {
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${randomBytes(6).toString('hex')}.dck-save`,
  )
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await writeThrough(handle, bytes, mode)
    } finally {
      await handle.close()
    }
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

// A file with other hard links is written in place: a rename would leave the other names on the old content
async function writeInPlace(target: string, bytes: Uint8Array) {
  const handle = await open(target, 'r+')
  try {
    await handle.truncate(0)
    await writeThrough(handle, bytes, undefined)
  } finally {
    await handle.close()
  }
}

async function write(path: string, bytes: Uint8Array, expected: FileStamp | null) {
  // A link is written through to its file; a file that does not exist has no real path yet
  const target = await realpath(path).catch(() => path)
  const disk = await diskStamp(target)
  if (!disk.ok) return fail(errorBody('DCK-FIL-003', disk.error.message))
  if (saveStep(expected, disk.value) === 'conflict')
    return ok({ kind: 'changed' as const, disk: disk.value })
  try {
    const before = disk.value === undefined ? undefined : await stat(target)
    // A rename would replace a file the user may not write, since only the folder's permission counts
    if (before) await access(target, constants.W_OK)
    if (before && before.nlink > 1) await writeInPlace(target, bytes)
    else await replace(target, bytes, before ? before.mode & 0o7777 : NEW_FILE_MODE)
    // Of the bytes written: another writer right after shows as a change, not as the user's text
    const stamp = stampOf(bytes, (await stat(target)).mtimeMs)
    return ok({ kind: 'written' as const, stamp })
  } catch (error) {
    return fail(errorBody('DCK-FIL-003', `${target}: ${codeOf(error)}`))
  }
}

// Files on the local disk through Node; the bytes go to the caller and never to the log
export function createNodeFileStore(options: NodeFileStoreOptions = {}): FileStore {
  const watchFolder = options.watchFolder ?? nodeWatchFolder
  const settleMs = options.settleMs ?? SETTLE_MS
  const logger = options.logger ?? silentLogger

  return {
    stat: (path) => withFile(path, async (_handle, size, mtimeMs) => ({ size, mtimeMs })),
    head: (path, length) =>
      withFile(path, async (handle, size) => {
        const buffer = new Uint8Array(Math.min(length, size))
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        return buffer.subarray(0, bytesRead)
      }),
    read: readBytes,
    write,
    watch(path, since, listener) {
      let target: string
      try {
        target = realpathSync(path)
      } catch (error) {
        return fail(errorBody('DCK-FIL-004', `${path}: ${codeOf(error)}`))
      }
      const name = basename(target)
      let known = since
      let closed = false
      let timer: ReturnType<typeof setTimeout> | undefined

      // Reports only what differs from the last content it saw: a touch, or a save of the same bytes, is quiet
      const check = async () => {
        const first = await diskStamp(target)
        if (closed || !first.ok) return
        const now = sameDisk(known, first.value)
          ? first
          : await steadyStamp(target, first, settleMs)
        if (closed || !now.ok) return
        const previous = known
        known = now.value
        if (sameDisk(previous, now.value)) return
        listener(
          now.value === undefined ? { kind: 'deleted' } : { kind: 'changed', stamp: now.value },
        )
      }
      // Without `since` the first look is the baseline; with it, a change before the watch shows at once
      let queue: Promise<void> = since
        ? check()
        : diskStamp(target).then((first) => {
            known = first.ok ? first.value : undefined
          })
      const schedule = () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          queue = queue.then(check)
        }, settleMs)
      }

      let watcher: FolderWatcher
      try {
        watcher = watchFolder(
          dirname(target),
          (changed) => {
            if (changed === null || changed === name) schedule()
          },
          (error) => {
            logger.warn('file watch failed', { file: target, error: String(error) })
            schedule()
          },
        )
      } catch (error) {
        return fail(errorBody('DCK-FIL-004', `${target}: ${codeOf(error)}`))
      }
      return ok(() => {
        closed = true
        clearTimeout(timer)
        watcher.close()
      })
    },
  }
}
