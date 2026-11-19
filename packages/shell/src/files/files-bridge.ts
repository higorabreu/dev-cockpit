import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import {
  createFileOpener,
  encodeText,
  errorBody,
  FILE_LIMITS,
  FILE_SCHEME,
  type FileStore,
  fail,
  hostChannels,
  type Logger,
  ok,
  type TextEncoding,
  type Unsubscribe,
} from '@dck/core'
import { z } from 'zod'
import type { IpcMainApi } from '../electron/host-bridge.ts'

const MAX_PATH_LENGTH = 4096
const pathSchema = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .refine((text) => !text.includes('\0') && isAbsolute(text))

const stampSchema = z.object({
  size: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
  hash: z.string().min(1).max(128),
})

// The editor may grow a text past what opens editable; past the open limit it is a bug or abuse
const saveSchema = z.object({
  path: pathSchema,
  text: z.string().max(FILE_LIMITS.openBytes),
  expected: stampSchema.nullable(),
})

const watchSchema = z.object({ path: pathSchema, since: stampSchema.optional() })

export interface FilesBridgeOptions {
  readonly ipcMain: IpcMainApi
  readonly store: FileStore
  readonly logger: Logger
  send(channel: string, ...args: unknown[]): void
  // The id in an image's or a PDF's address; random, so the window cannot name a path through it
  readonly newId?: () => string
}

// What the last open of a path found: only an editable text is saved, and in the encoding it was read in
interface Opened {
  readonly encoding: TextEncoding | undefined
}

// Any file the user opens is read; only a file opened in this session is saved, watched or served to the
// window, and never its content in a log
export function registerFilesBridge(options: FilesBridgeOptions) {
  const { ipcMain, store, logger, send } = options
  const newId = options.newId ?? randomUUID
  const opened = new Map<string, Opened>()
  const idByPath = new Map<string, string>()
  const pathById = new Map<string, string>()
  const watches = new Map<string, { count: number; stop: Unsubscribe }>()

  const opener = createFileOpener({
    store,
    urlOf(path) {
      const id = idByPath.get(path) ?? newId()
      idByPath.set(path, id)
      pathById.set(id, path)
      return `${FILE_SCHEME}://open/${id}`
    },
  })

  ipcMain.handle(hostChannels.filesOpen, async (_event, path: unknown) => {
    const parsed = pathSchema.safeParse(path)
    if (!parsed.success) {
      logger.warn('file request refused', { kind: 'open' })
      return fail(errorBody('DCK-IPC-003', 'files open'))
    }
    const result = await opener.open(parsed.data)
    if (!result.ok) {
      logger.warn('file not opened', { error: result.error.message })
      return result
    }
    const file = result.value
    const editable = 'base' in file && file.readOnly === undefined
    opened.set(file.path, { encoding: editable ? file.base.encoding : undefined })
    logger.info('file opened', { file: file.path, kind: file.kind })
    return result
  })

  ipcMain.handle(hostChannels.filesSave, async (_event, payload: unknown) => {
    const parsed = saveSchema.safeParse(payload)
    const encoding = parsed.success ? opened.get(parsed.data.path)?.encoding : undefined
    const bytes = parsed.success && encoding ? encodeText(parsed.data.text, encoding) : undefined
    if (!parsed.success || bytes === undefined) {
      logger.warn('file request refused', { kind: 'save' })
      return fail(errorBody('DCK-IPC-003', 'files save'))
    }
    const { path, expected } = parsed.data
    const result = await store.write(path, bytes, expected)
    if (!result.ok) logger.warn('file not saved', { error: result.error.message })
    else if (result.value.kind === 'changed')
      logger.info('file changed on disk, not saved', { file: path })
    else logger.info('file saved', { file: path })
    return result
  })

  ipcMain.handle(hostChannels.filesWatch, (_event, payload: unknown) => {
    const parsed = watchSchema.safeParse(payload)
    if (!parsed.success || !opened.has(parsed.data.path)) {
      logger.warn('file request refused', { kind: 'watch' })
      return fail(errorBody('DCK-IPC-003', 'files watch'))
    }
    const { path, since } = parsed.data
    const watching = watches.get(path)
    if (watching) {
      watching.count++
      return ok(null)
    }
    const started = store.watch(path, since, (change) =>
      send(hostChannels.filesChanged, path, change),
    )
    if (!started.ok) {
      logger.warn('file not watched', { error: started.error.message })
      return started
    }
    watches.set(path, { count: 1, stop: started.value })
    return ok(null)
  })

  ipcMain.on(hostChannels.filesUnwatch, (_event, path: unknown) => {
    const watching = typeof path === 'string' ? watches.get(path) : undefined
    if (!watching || typeof path !== 'string') return
    watching.count--
    if (watching.count > 0) return
    watching.stop()
    watches.delete(path)
  })

  return {
    // For the protocol: the path of an image or a PDF opened under this id
    mediaPath: (id: string) => pathById.get(id),
    closeAll() {
      for (const watching of watches.values()) watching.stop()
      watches.clear()
    },
  }
}
