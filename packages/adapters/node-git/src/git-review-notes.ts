import { randomBytes } from 'node:crypto'
import { lstat, mkdir, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import {
  type ErrorBody,
  errorBody,
  fail,
  ok,
  REVIEW_NOTES_PREFIX,
  REVIEW_NOTES_TEMP_PREFIX,
  type Result,
  type ReviewNotes,
  reviewNoteName,
  reviewStamp,
  staleReviewNotes,
} from '@dck/core'
import { type GitFailure, type GitRun, runGit } from './git-run.ts'

const QUICK = { timeoutMs: 5000, maxBytes: 64 * 1024 }
// Names a second review written in the same second as another; past this the newest name is replaced
const MAX_COPIES = 20

export interface NoteFiles {
  mkdir(path: string): Promise<void>
  // Creates the file, never through a link or over another one, readable by its owner only
  writeNew(path: string, text: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  list(folder: string): Promise<readonly string[]>
  remove(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  realpath(path: string): Promise<string>
}

export interface GitReviewNotesOptions {
  readonly run?: GitRun
  readonly files?: NoteFiles
  readonly tempFolder?: () => string
  readonly now?: () => Date
}

const nodeFiles: NoteFiles = {
  mkdir: (path) => mkdir(path, { recursive: true, mode: 0o700 }).then(() => undefined),
  writeNew: (path, text) => writeFile(path, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' }),
  rename: (from, to) => rename(from, to),
  list: (folder) => readdir(folder),
  remove: (path) => unlink(path),
  exists: (path) =>
    lstat(path).then(
      () => true,
      () => false,
    ),
  realpath: (path) => realpath(path),
}

function failed(failure: GitFailure): ErrorBody {
  if (failure.kind === 'missing') return errorBody('DCK-GIT-005', 'git dir')
  if (failure.kind === 'timeout') return errorBody('DCK-GIT-002', 'git dir')
  return errorBody('DCK-GIT-001', `git dir: ${failure.kind}`)
}

const inside = (root: string, path: string) => {
  const rest = relative(root, path)
  return rest !== '' && !rest.startsWith('..') && !isAbsolute(rest)
}

// The review's comments as a file the agent reads: in the repository's git folder when that folder is
// inside the repository (the agent may read it without asking, git never lists it), else in the system's
// temporary folder (a linked worktree or a submodule keeps its git folder elsewhere)
export function createGitReviewNotes(options: GitReviewNotesOptions = {}): ReviewNotes {
  const run = options.run ?? runGit
  const files = options.files ?? nodeFiles
  const tempFolder = options.tempFolder ?? tmpdir
  const now = options.now ?? (() => new Date())

  async function place(
    root: string,
  ): Promise<Result<{ folder: string; prefix: string }, ErrorBody>> {
    const answer = await run(root, ['rev-parse', '--absolute-git-dir'], QUICK)
    if (!answer.ok) return fail(failed(answer.failure))
    const gitDir = answer.stdout.trim()
    const [realRoot, realGit] = await Promise.all([
      files.realpath(root).catch(() => root),
      files.realpath(gitDir).catch(() => gitDir),
    ])
    return inside(realRoot, realGit)
      ? ok({ folder: join(gitDir, 'dck'), prefix: REVIEW_NOTES_PREFIX })
      : ok({ folder: tempFolder(), prefix: REVIEW_NOTES_TEMP_PREFIX })
  }

  async function freeName(folder: string, prefix: string): Promise<string> {
    const stamp = reviewStamp(now())
    for (let copy = 1; copy < MAX_COPIES; copy++) {
      const path = join(folder, reviewNoteName(prefix, stamp, copy))
      if (!(await files.exists(path))) return path
    }
    return join(folder, reviewNoteName(prefix, stamp, MAX_COPIES))
  }

  // Older reviews go; a file another user owns in a shared folder stays where it is
  async function prune(folder: string, prefix: string) {
    const names = await files.list(folder).catch(() => [])
    for (const name of staleReviewNotes(names, prefix)) {
      await files.remove(join(folder, name)).catch(() => undefined)
    }
  }

  return {
    async save(root, markdown) {
      const found = await place(root)
      if (!found.ok) return found
      const { folder, prefix } = found.value
      try {
        await files.mkdir(folder)
        const path = await freeName(folder, prefix)
        // Written whole beside it, then renamed, so the agent never reads half a review
        const temporary = join(folder, `.${prefix}${randomBytes(6).toString('hex')}.tmp`)
        await files.writeNew(temporary, markdown)
        await files.rename(temporary, path).catch(async (error: unknown) => {
          await files.remove(temporary).catch(() => undefined)
          throw error
        })
        await prune(folder, prefix)
        return ok(path)
      } catch (error) {
        return fail(errorBody('DCK-GIT-006', `${folder}: ${String(error)}`))
      }
    },
  }
}
