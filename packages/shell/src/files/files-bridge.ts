import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, normalize, relative } from 'node:path'
import {
  createFileOpener,
  type EditorConfigFile,
  encodeText,
  errorBody,
  FILE_LIMITS,
  FILE_SCHEME,
  type FileStore,
  fail,
  type GitIgnoreCheck,
  hostChannels,
  imageTypeOf,
  type Logger,
  ok,
  parseEditorConfig,
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

// The images a Markdown preview draws from its file's folder; a README with more is unusual
const MAX_ASSETS = 500
const assetsSchema = z.object({
  document: pathSchema,
  paths: z.array(pathSchema).max(MAX_ASSETS),
})

// Inside the folder, never the folder itself, and written plainly (no `..`, no doubled separator)
const isUnder = (folder: string, path: string) => {
  const step = relative(folder, path)
  return step !== '' && !step.startsWith('..') && !isAbsolute(step) && normalize(path) === path
}

// An `.editorconfig` is a few lines; the walk up stops at the root of the disk or at one marked root
const MAX_CONFIG_BYTES = 64 * 1024
const MAX_CONFIG_FOLDERS = 64

export interface FilesBridgeOptions {
  readonly ipcMain: IpcMainApi
  readonly store: FileStore
  readonly ignore: GitIgnoreCheck
  readonly logger: Logger
  send(channel: string, ...args: unknown[]): void
  // The id in an image's or a PDF's address; random, so the window cannot name a path through it
  readonly newId?: () => string
  // Where a path really leads, links followed; undefined when it does not exist. A Markdown image must
  // stay under its file's folder after its links too
  readonly realPath?: (path: string) => Promise<string | undefined>
}

// What the last open of a path found: only an editable text is saved, and in the encoding it was read in
interface Opened {
  readonly encoding: TextEncoding | undefined
  readonly markdown: boolean
  readonly image: boolean
}

// Any file the user opens is read; only a file opened in this session is saved, watched or served to the
// window, and never its content in a log
export function registerFilesBridge(options: FilesBridgeOptions) {
  const { ipcMain, store, logger, send } = options

  // A path of a file the window opened in this session, else undefined
  const openedPath = (path: unknown, kind: string) => {
    const parsed = pathSchema.safeParse(path)
    if (parsed.success && opened.has(parsed.data)) return parsed.data
    logger.warn('file request refused', { kind })
    return undefined
  }

  async function editorConfigs(path: string): Promise<EditorConfigFile[]> {
    const found: EditorConfigFile[] = []
    let dir = dirname(path)
    for (let step = 0; step < MAX_CONFIG_FOLDERS; step++) {
      const file = join(dir, '.editorconfig')
      const info = await store.stat(file)
      const read =
        info.ok && info.value.size <= MAX_CONFIG_BYTES ? await store.read(file) : undefined
      if (read?.ok) {
        const text = new TextDecoder().decode(read.value.bytes)
        found.push({ dir, text })
        if (parseEditorConfig(text).root) break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return found
  }
  const newId = options.newId ?? randomUUID
  const opened = new Map<string, Opened>()
  const idByPath = new Map<string, string>()
  const pathById = new Map<string, string>()
  const watches = new Map<string, { count: number; stop: Unsubscribe }>()
  // A Markdown file's images by id, and the ids each open Markdown file was given
  const assetById = new Map<string, string>()
  const assetsOf = new Map<string, Map<string, string>>()
  const realPath = options.realPath ?? (async (path: string) => path)

  async function assetUrl(document: string, path: string): Promise<string | null> {
    const folder = dirname(document)
    if (!isUnder(folder, path) || imageTypeOf(path) === undefined) return null
    const [realFolder, real] = await Promise.all([realPath(folder), realPath(path)])
    if (realFolder === undefined || real === undefined || !isUnder(realFolder, real)) return null
    const info = await store.stat(path)
    if (!info.ok || info.value.size > FILE_LIMITS.openBytes) return null
    const ids = assetsOf.get(document) ?? new Map<string, string>()
    assetsOf.set(document, ids)
    const id = ids.get(path) ?? newId()
    ids.set(path, id)
    assetById.set(id, path)
    return `${FILE_SCHEME}://open/${id}`
  }

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
    opened.set(file.path, {
      encoding: editable ? file.base.encoding : undefined,
      markdown: file.kind === 'markdown',
      image: file.kind === 'image',
    })
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

  ipcMain.handle(hostChannels.filesEditorConfig, (_event, path: unknown) => {
    const file = openedPath(path, 'editorconfig')
    return file === undefined ? [] : editorConfigs(file)
  })

  ipcMain.handle(hostChannels.filesIgnored, (_event, path: unknown) => {
    const file = openedPath(path, 'ignored')
    return file === undefined ? false : options.ignore.isIgnored(file)
  })

  ipcMain.handle(hostChannels.filesAssets, async (_event, payload: unknown) => {
    const parsed = assetsSchema.safeParse(payload)
    if (!parsed.success || opened.get(parsed.data.document)?.markdown !== true) {
      logger.warn('file request refused', { kind: 'assets' })
      return []
    }
    const { document, paths } = parsed.data
    return Promise.all(paths.map((path) => assetUrl(document, path)))
  })

  // An image's bytes for the window to decode at the size it shows: a decode through `<img>` stays in
  // Chromium's memory after the image closes (F0)
  ipcMain.handle(hostChannels.filesBytes, async (_event, path: unknown) => {
    const parsed = pathSchema.safeParse(path)
    if (!parsed.success || opened.get(parsed.data)?.image !== true) {
      logger.warn('file request refused', { kind: 'bytes' })
      return undefined
    }
    const info = await store.stat(parsed.data)
    if (!info.ok || info.value.size > FILE_LIMITS.openBytes) return undefined
    const read = await store.read(parsed.data)
    return read.ok ? read.value.bytes : undefined
  })

  ipcMain.on(hostChannels.filesRelease, (_event, document: unknown) => {
    const ids = typeof document === 'string' ? assetsOf.get(document) : undefined
    if (!ids || typeof document !== 'string') return
    for (const id of ids.values()) assetById.delete(id)
    assetsOf.delete(document)
  })

  return {
    // For the protocol: the path of an image or a PDF opened under this id, or of an open Markdown file's
    // image
    mediaPath: (id: string) => pathById.get(id) ?? assetById.get(id),
    closeAll() {
      for (const watching of watches.values()) watching.stop()
      watches.clear()
    },
  }
}
