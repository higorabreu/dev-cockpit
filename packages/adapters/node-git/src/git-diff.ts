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
const UNTRACKED_LIMIT = 300
const UNTRACKED_MAX_BYTES = 1024 * 1024
const READ_MAX_BYTES = 8 * 1024 * 1024
const PARALLEL = 8
const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '-M'] as const

export interface DiffFiles {
  readFile(path: string): Promise<Buffer>
  size(path: string): Promise<number | undefined>
  realpath(path: string): Promise<string>
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

  async function untracked(root: string, whitespace: readonly string[]): Promise<DiffFile[]> {
    const listing = await quick(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    if (!listing.ok) return []
    // A nested repository is listed as a folder and is not a file to compare
    const paths = listing.stdout
      .split('\0')
      .filter((path) => path !== '' && !path.endsWith('/'))
      .slice(0, UNTRACKED_LIMIT)
    const found = await inBatches(paths, PARALLEL, async (path): Promise<DiffFile[]> => {
      const size = await files.size(join(root, path))
      if (size !== undefined && size > UNTRACKED_MAX_BYTES) {
        return [omitted(path, size)]
      }
      const result = await run(
        root,
        ['diff', ...DIFF_FLAGS, ...whitespace, '--no-index', '--', '/dev/null', path],
        QUICK,
      )
      if (!result.ok) return []
      return parseUnifiedDiff(result.stdout).map((file) => ({
        ...file,
        path,
        status: 'added',
        untracked: true,
      }))
    })
    return found.flat()
  }

  const omitted = (path: string, size: number): DiffFile => ({
    path,
    oldPath: undefined,
    status: 'added',
    oldMode: undefined,
    newMode: undefined,
    binary: false,
    nonUtf8: false,
    submodule: false,
    crlf: false,
    generated: false,
    untracked: true,
    additions: 0,
    deletions: 0,
    hunks: [],
    size,
    omitted: true,
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
    if (file.status === 'deleted' || file.submodule || file.omitted) return withFlag
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

    async fileLines(root, path): Promise<Result<readonly string[], ErrorBody>> {
      const inside = normalize(path)
      if (isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`))
        return fail(errorBody('DCK-GIT-004', 'relative path outside the root'))
      const target = join(root, inside)
      const [realRoot, realTarget] = await Promise.all([
        files.realpath(root).catch(() => undefined),
        files.realpath(target).catch(() => undefined),
      ])
      if (realRoot === undefined || realTarget === undefined)
        return fail(errorBody('DCK-GIT-001', 'file not found'))
      const back = relative(realRoot, realTarget)
      if (back === '' || back.startsWith('..') || isAbsolute(back))
        return fail(errorBody('DCK-GIT-004', 'link outside the root'))
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
