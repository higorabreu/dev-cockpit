import { isAbsolute } from 'node:path'
import {
  type FileFinder,
  type FileListing,
  type GitOthers,
  hostChannels,
  isClosedFolder,
  type Logger,
  type WalkResult,
} from '@dck/core'
import { z } from 'zod'
import type { IpcMainApi } from '../electron/host-bridge.ts'

const MAX_PATH_LENGTH = 4096

const pathText = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .refine((text) => !text.includes('\0'))
// The tab's folder becomes git's working folder, so it must be absolute
const folderSchema = pathText.refine((text) => isAbsolute(text))
// A closed folder as a listing names it: relative, with /, never climbing out of the root
const expandSchema = z.object({
  root: folderSchema,
  folder: pathText.refine(
    (text) =>
      isClosedFolder(text) &&
      !text.startsWith('/') &&
      !text.includes('\\') &&
      text
        .slice(0, -1)
        .split('/')
        .every((part) => part !== '' && part !== '.' && part !== '..'),
  ),
})

const emptyListing = (root: string): FileListing => ({
  kind: 'folder',
  root,
  files: [],
  ignored: [],
  truncated: false,
  partial: false,
})
const noOthers: GitOthers = { files: [], ignored: [], truncated: false }
const emptyStep: WalkResult = { entries: [], truncated: false }

export interface FileSearchBridgeOptions {
  readonly ipcMain: IpcMainApi
  readonly finder: FileFinder
  isFolder(path: string): Promise<boolean>
  readonly logger: Logger
}

// The file search's channels: names of files only, and a step only into a folder a listing closed
export function registerFileSearchBridge(options: FileSearchBridgeOptions) {
  const { ipcMain, finder, logger } = options
  // By root, the closed folders the window may step into: those listed and those found stepping
  const closed = new Map<string, Set<string>>()
  // The repositories whose untracked and ignored files the window may ask for
  const partial = new Set<string>()

  ipcMain.handle(hostChannels.fileSearchList, async (_event, cwd: unknown) => {
    const parsed = folderSchema.safeParse(cwd)
    if (!parsed.success || !(await options.isFolder(parsed.data))) {
      logger.warn('file search request refused', { kind: 'list' })
      return emptyListing(typeof cwd === 'string' ? cwd : '')
    }
    const started = performance.now()
    const listing = await finder.list(parsed.data)
    closed.set(listing.root, new Set(listing.ignored.filter(isClosedFolder)))
    if (listing.partial) partial.add(listing.root)
    logger.info('files listed', {
      kind: listing.kind,
      files: listing.files.length,
      ignored: listing.ignored.length,
      truncated: listing.truncated,
      ms: Math.round(performance.now() - started),
    })
    return listing
  })

  ipcMain.handle(hostChannels.fileSearchOthers, async (_event, root: unknown) => {
    const parsed = folderSchema.safeParse(root)
    if (!parsed.success || !partial.has(parsed.data)) {
      logger.warn('file search request refused', { kind: 'others' })
      return noOthers
    }
    const started = performance.now()
    const others = await finder.others(parsed.data)
    const known = closed.get(parsed.data) ?? new Set<string>()
    for (const entry of others.ignored) if (isClosedFolder(entry)) known.add(entry)
    closed.set(parsed.data, known)
    logger.info('untracked and ignored files listed', {
      files: others.files.length,
      ignored: others.ignored.length,
      ms: Math.round(performance.now() - started),
    })
    return others
  })

  ipcMain.handle(hostChannels.fileSearchExpand, async (_event, payload: unknown) => {
    const parsed = expandSchema.safeParse(payload)
    const known = parsed.success ? closed.get(parsed.data.root) : undefined
    if (!parsed.success || !known?.has(parsed.data.folder)) {
      logger.warn('file search request refused', { kind: 'expand' })
      return emptyStep
    }
    const result = await finder.expand(parsed.data.root, parsed.data.folder)
    for (const entry of result.entries) if (isClosedFolder(entry)) known.add(entry)
    return result
  })
}
