import type { Dirent } from 'node:fs'
import { lstat, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { FolderWalk, WalkResult } from '@dck/core'

export type EntryKind = 'file' | 'dir' | 'link' | 'other'

export interface WalkEntry {
  readonly name: string
  readonly kind: EntryKind
}

// What the walk reads from the disk, so a test can give a tree of its own
export interface WalkFileSystem {
  // Undefined when the folder cannot be read
  list(path: string): Promise<readonly WalkEntry[] | undefined>
  // What a path is, a link followed (`follow`) or not
  kind(path: string, follow: boolean): Promise<EntryKind | undefined>
}

const kindOf = (entry: Pick<Dirent, 'isFile' | 'isDirectory' | 'isSymbolicLink'>): EntryKind =>
  entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other'

export const nodeWalkFileSystem: WalkFileSystem = {
  list: (path) =>
    readdir(path, { withFileTypes: true }).then(
      (entries) => entries.map((entry) => ({ name: entry.name, kind: kindOf(entry) })),
      // An unreadable folder is left out; the rest of the walk goes on
      () => undefined,
    ),
  kind: (path, follow) => (follow ? stat(path) : lstat(path)).then(kindOf, () => undefined),
}

export interface FolderWalkDependencies {
  readonly fs?: WalkFileSystem
  readonly now?: () => number
}

interface Pending {
  readonly path: string
  // The path relative to the root, ending with / (empty for the root)
  readonly relative: string
  readonly depth: number
}

// Folders read at once: small folders cost a system call each, which waits on the disk more than the CPU
const PARALLEL = 16

const byName = (a: WalkEntry, b: WalkEntry) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

// A breadth first walk, so the shallow files come first when a limit stops it; the folders of a level
// are read a few at a time and added in order, so the answer is the same on every run
export function createFolderWalk(dependencies: FolderWalkDependencies = {}): FolderWalk {
  const fs = dependencies.fs ?? nodeWalkFileSystem
  const now = dependencies.now ?? (() => performance.now())
  return {
    async walk(root, from, limits): Promise<WalkResult> {
      const start = from === '' ? root : join(root, ...from.split('/').filter(Boolean))
      // A step into a folder that is in fact a link would leave the repository
      if (from !== '' && (await fs.kind(start, false)) !== 'dir')
        return { entries: [], truncated: false }
      const deadline = now() + limits.timeoutMs
      const skip = new Set(limits.skip ?? [])
      const entries: string[] = []
      let queue: Pending[] = [{ path: start, relative: from, depth: 1 }]
      let at = 0
      while (at < queue.length) {
        if (now() > deadline) return { entries, truncated: true }
        const batch = queue.slice(at, at + PARALLEL)
        at += batch.length
        const listed = await Promise.all(batch.map((folder) => fs.list(folder.path)))
        for (const [index, folder] of batch.entries()) {
          for (const entry of [...(listed[index] ?? [])].sort(byName)) {
            if (entries.length >= limits.maxEntries) return { entries, truncated: true }
            const relative = `${folder.relative}${entry.name}`
            const path = join(folder.path, entry.name)
            if (entry.kind === 'dir') {
              if (skip.has(entry.name)) continue
              if (limits.maxDepth !== undefined && folder.depth >= limits.maxDepth)
                entries.push(`${relative}/`)
              else queue.push({ path, relative: `${relative}/`, depth: folder.depth + 1 })
            } else if (entry.kind === 'file') entries.push(relative)
            // A link to a file opens like the file; a link to a folder is never followed
            else if (entry.kind === 'link' && (await fs.kind(path, true)) === 'file')
              entries.push(relative)
          }
        }
        // What was read leaves the queue, so a long walk does not keep every folder it passed
        if (at > 4096) {
          queue = queue.slice(at)
          at = 0
        }
      }
      return { entries, truncated: false }
    },
  }
}
