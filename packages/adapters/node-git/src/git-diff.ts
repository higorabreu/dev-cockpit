import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, sep } from 'node:path'
import {
  type DiffFile,
  type DiffOutcome,
  type DiffRequest,
  type DiffSource,
  type ErrorBody,
  errorBody,
  fail,
  hashText,
  isGeneratedPath,
  ok,
  parseUnifiedDiff,
  type Result,
  reviewDiff,
} from '@dck/core'
import { createBaseFinder } from './git-base.ts'
import { type GitAnswer, type GitFailure, type GitRun, inBatches, runGit } from './git-run.ts'

const QUICK = { timeoutMs: 5000, maxBytes: 1024 * 1024 }
// The whole diff of a scope; past this the review says it is too large instead of freezing
const DIFF = { timeoutMs: 15_000, maxBytes: 32 * 1024 * 1024 }
// Past this many untracked files the rest are listed and read only when asked
const UNTRACKED_LIMIT = 300
const UNTRACKED_MAX_BYTES = 1024 * 1024
// The diff of a file under the limit: every line gains a sign, so it can be twice the file
const UNTRACKED_DIFF = { timeoutMs: 5000, maxBytes: 4 * UNTRACKED_MAX_BYTES }
const READ_MAX_BYTES = 8 * 1024 * 1024
const PARALLEL = 8
// The status of a huge repository can be long; past this many changed paths only the status counts
const STAMP_LIMIT = 2000
const STATUS = { timeoutMs: 5000, maxBytes: 8 * 1024 * 1024 }
const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '-M'] as const

export interface DiffFiles {
  readFile(path: string): Promise<Buffer>
  size(path: string): Promise<number | undefined>
  realpath(path: string): Promise<string>
  // Size and modification time, which change when a file is written; undefined when it is gone
  stamp(path: string): Promise<string | undefined>
}

export interface GitDiffOptions {
  readonly run?: GitRun
  readonly files?: DiffFiles
}

const nodeFiles: DiffFiles = {
  readFile: (path) => readFile(path),
  size: (path) =>
    stat(path).then(
      (stats) => (stats.isFile() ? stats.size : undefined),
      () => undefined,
    ),
  realpath: (path) => realpath(path),
  stamp: (path) =>
    stat(path).then(
      (stats) => `${stats.size}:${stats.mtimeMs}`,
      () => undefined,
    ),
}

// The paths of `git status --porcelain=v2 -z`, relative to the folder it ran in: a changed entry has the
// path after 8 fields, a rename after 9 with the old path as the next entry, a conflict after 10
export function statusPaths(output: string): string[] {
  const entries = output.split('\0')
  const paths: string[] = []
  const after = (entry: string, fields: number) => entry.split(' ').slice(fields).join(' ')
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? ''
    if (entry.startsWith('1 ')) paths.push(after(entry, 8))
    else if (entry.startsWith('2 ')) {
      paths.push(after(entry, 9))
      index++
    } else if (entry.startsWith('u ')) paths.push(after(entry, 10))
    else if (entry.startsWith('? ')) paths.push(entry.slice(2))
  }
  return paths
}

function failed(failure: GitFailure, step: string): ErrorBody {
  if (failure.kind === 'missing') return errorBody('DCK-GIT-005', step)
  if (failure.kind === 'timeout') return errorBody('DCK-GIT-002', step)
  if (failure.kind === 'too-large') return errorBody('DCK-GIT-003', step)
  return errorBody('DCK-GIT-001', `${step}: exit ${failure.code}`)
}

const lineCount = (text: string) =>
  text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

// A comparison of the tab's repository through the git command line, read only
export function createGitDiffSource(options: GitDiffOptions = {}): DiffSource {
  const run = options.run ?? runGit
  const files = options.files ?? nodeFiles

  const quick = (cwd: string, args: readonly string[], input?: string): Promise<GitAnswer> =>
    run(cwd, args, input === undefined ? QUICK : { ...QUICK, input })
  const answer = async (cwd: string, args: readonly string[]) => {
    const result = await quick(cwd, args)
    return result.ok ? result.stdout.trim() : undefined
  }
  const bases = createBaseFinder(answer)

  // HEAD, or the empty tree in a repository without commits, so its files read as added
  async function head(root: string): Promise<Result<string, ErrorBody>> {
    const commit = await answer(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'])
    if (commit) return ok(commit)
    const empty = await quick(root, ['hash-object', '-t', 'tree', '--stdin'], '')
    return empty.ok ? ok(empty.stdout.trim()) : fail(failed(empty.failure, 'empty tree'))
  }

  // Every untracked file of a repository, by its path there; a nested repository is a folder, not a file
  async function untrackedPaths(dir: string): Promise<string[]> {
    const listing = await run(dir, ['ls-files', '--others', '--exclude-standard', '-z'], STATUS)
    if (!listing.ok) return []
    return listing.stdout.split('\0').filter((path) => path !== '' && !path.endsWith('/'))
  }

  // An untracked file as an addition; past 1 MB only its size, and one git cannot read stays listed
  // with its content not loaded
  async function readUntracked(
    dir: string,
    path: string,
    whitespace: readonly string[],
  ): Promise<DiffFile> {
    const size = await files.size(join(dir, path))
    if (size !== undefined && size > UNTRACKED_MAX_BYTES)
      return { ...untrackedEntry(path), size, omitted: true }
    const result = await run(
      dir,
      ['diff', ...DIFF_FLAGS, ...whitespace, '--no-index', '--', '/dev/null', path],
      UNTRACKED_DIFF,
    )
    const [file] = result.ok ? parseUnifiedDiff(result.stdout) : []
    if (!file) return { ...untrackedEntry(path), unloaded: true }
    return { ...file, path, status: 'added', untracked: true }
  }

  // The first files are read and the rest only listed, so a huge untracked folder never hides a file
  async function untracked(root: string, whitespace: readonly string[]): Promise<DiffFile[]> {
    const paths = await untrackedPaths(root)
    const read = await inBatches(paths.slice(0, UNTRACKED_LIMIT), PARALLEL, (path) =>
      readUntracked(root, path, whitespace),
    )
    const listed = paths
      .slice(UNTRACKED_LIMIT)
      .map((path): DiffFile => ({ ...untrackedEntry(path), unloaded: true }))
    return [...read, ...listed]
  }

  const untrackedEntry = (path: string): DiffFile => ({
    path,
    oldPath: undefined,
    status: 'added',
    oldMode: undefined,
    newMode: undefined,
    binary: false,
    nonUtf8: false,
    submodule: false,
    crlf: false,
    generated: isGeneratedPath(path),
    untracked: true,
    additions: 0,
    deletions: 0,
    hunks: [],
  })

  // `linguist-generated` in .gitattributes marks files a tool wrote
  async function generatedByAttribute(root: string, paths: readonly string[]) {
    if (paths.length === 0) return new Set<string>()
    const result = await quick(
      root,
      ['check-attr', '-z', '--stdin', 'linguist-generated'],
      `${paths.join('\0')}\0`,
    )
    const marked = new Set<string>()
    if (!result.ok) return marked
    const fields = result.stdout.split('\0')
    for (let index = 0; index + 2 < fields.length; index += 3) {
      const value = fields[index + 2]
      if (value === 'set' || value === 'true') marked.add(fields[index] ?? '')
    }
    return marked
  }

  // The new file's length lets the review offer the lines after the last hunk; a binary shows its size
  async function complete(root: string, file: DiffFile, generated: boolean): Promise<DiffFile> {
    const withFlag = generated && !file.generated ? { ...file, generated: true } : file
    if (file.status === 'deleted' || file.submodule || file.omitted || file.unloaded)
      return withFlag
    const path = join(root, file.path)
    if (file.binary) {
      const size = await files.size(path)
      return size === undefined ? withFlag : { ...withFlag, size }
    }
    if (file.hunks.length === 0) return withFlag
    const size = await files.size(path)
    if (size === undefined || size > READ_MAX_BYTES) return withFlag
    const text = await files.readFile(path).then(
      (buffer) => buffer.toString('utf8'),
      () => undefined,
    )
    return text === undefined ? withFlag : { ...withFlag, newLineCount: lineCount(text) }
  }

  // The real path of a file of the repository, refusing a path or a link that leads outside it
  async function insideRoot(root: string, path: string): Promise<Result<string, ErrorBody>> {
    const inside = normalize(path)
    if (isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`))
      return fail(errorBody('DCK-GIT-004', 'relative path outside the root'))
    const [realRoot, realTarget] = await Promise.all([
      files.realpath(root).catch(() => undefined),
      files.realpath(join(root, inside)).catch(() => undefined),
    ])
    if (realRoot === undefined || realTarget === undefined)
      return fail(errorBody('DCK-GIT-001', 'file not found'))
    const back = relative(realRoot, realTarget)
    if (back === '' || back.startsWith('..') || isAbsolute(back))
      return fail(errorBody('DCK-GIT-004', 'link outside the root'))
    return ok(realTarget)
  }

  return {
    async diff(request: DiffRequest): Promise<Result<DiffOutcome, ErrorBody>> {
      const top = await quick(request.cwd, ['rev-parse', '--show-toplevel'])
      if (!top.ok && top.failure.kind === 'exit') return ok({ kind: 'not-repository' })
      if (!top.ok) return fail(failed(top.failure, 'rev-parse'))
      const root = top.stdout.trim()

      const current = await head(root)
      if (!current.ok) return current
      let from = current.value
      // Found in every scope, so the scope select can name what the other two compare with
      const branch = await bases.find(root, current.value, request.base)
      if (request.scope !== 'uncommitted') {
        const unpushed = request.scope === 'unpushed'
        const against = unpushed ? branch.upstream : branch.base?.name
        const merge = against && (await answer(root, ['merge-base', 'HEAD', against]))
        if (!merge) return ok({ kind: unpushed ? 'no-upstream' : 'no-base', root })
        from = merge
      }

      const whitespace = request.ignoreWhitespace ? ['-w'] : []
      const [tracked, added] = await Promise.all([
        run(root, ['diff', ...DIFF_FLAGS, ...whitespace, from, '--'], DIFF),
        untracked(root, whitespace),
      ])
      if (!tracked.ok) return fail(failed(tracked.failure, 'diff'))
      const parsed = [...parseUnifiedDiff(tracked.stdout), ...added].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      )
      const marked = await generatedByAttribute(
        root,
        parsed.map((file) => file.path),
      )
      const completed = await inBatches(parsed, PARALLEL, (file) =>
        complete(root, file, marked.has(file.path)),
      )
      return ok({ kind: 'ok', diff: reviewDiff(root, request.scope, branch, completed) })
    },

    async fingerprint(cwd) {
      const status = await run(
        cwd,
        ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'],
        STATUS,
      )
      if (!status.ok) return undefined
      const paths = statusPaths(status.stdout).slice(0, STAMP_LIMIT)
      const stamps = await inBatches(paths, PARALLEL * 2, (path) => files.stamp(join(cwd, path)))
      return hashText(`${status.stdout}\0${stamps.map((stamp) => stamp ?? '-').join('\0')}`)
    },

    async untrackedFile(root, path, ignoreWhitespace): Promise<Result<DiffFile, ErrorBody>> {
      const resolved = await insideRoot(root, path)
      if (!resolved.ok) return resolved
      const inside = normalize(path)
      const file = await readUntracked(root, inside, ignoreWhitespace ? ['-w'] : [])
      if (file.unloaded) return fail(errorBody('DCK-GIT-001', 'untracked file not readable'))
      return ok(await complete(root, file, false))
    },

    async fileLines(root, path): Promise<Result<readonly string[], ErrorBody>> {
      const resolved = await insideRoot(root, path)
      if (!resolved.ok) return resolved
      const realTarget = resolved.value
      const size = await files.size(realTarget)
      if (size === undefined || size > READ_MAX_BYTES)
        return fail(errorBody('DCK-GIT-003', `file of ${size ?? 'unknown'} bytes`))
      const text = await files.readFile(realTarget).then(
        (buffer) => buffer.toString('utf8'),
        () => undefined,
      )
      if (text === undefined) return fail(errorBody('DCK-GIT-001', 'file not readable'))
      const lines = text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
      if (text.endsWith('\n')) lines.pop()
      return ok(lines)
    },
  }
}
