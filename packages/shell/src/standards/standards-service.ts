import { join } from 'node:path'
import {
  createFileExtensionFinder,
  createStandardFiles,
  findRepositoryRoot,
  type WritableFiles,
} from '@dck/adapter-extension-files'
import {
  checkText,
  createStandardsWorkspace,
  type ErrorBody,
  EXTENSION_API_VERSION,
  errorBody,
  fail,
  type GitStatus,
  type LoadedStandards,
  type Logger,
  type Matcher,
  ok,
  type ResolvedStandard,
  type Result,
  ruleFields,
  type StandardMarks,
  type StandardsChange,
  type StandardsView,
  type StandardsWorkspace,
} from '@dck/core'

const DEFAULT_TTL_MS = 5000
const CHECKED_MAX = 500

export interface StandardsServiceOptions {
  // The app's data folder, which holds the extensions folder and the user's own standards
  readonly configDir: string
  readonly appVersion: string
  // The ids in the `extensions.disabled` setting
  disabled(): readonly string[]
  // Comes with a time limit: an expression from a repository file must never hang the window
  readonly match: Matcher
  readonly logger: Logger
  readonly fs?: WritableFiles
  readonly ttlMs?: number
  readonly now?: () => number
}

interface CacheEntry {
  readonly at: number
  // The rules as text: while they stay the same, a text already checked is not checked again
  readonly signature: string
  readonly standards: readonly ResolvedStandard[]
  readonly checked: Map<string, readonly string[]>
}

// The failure detail already names the file, and the page shows the path beside it
function withoutPath(message: string, path: string): string {
  const at = message.indexOf(`${path}: `)
  return at === -1 ? message : message.slice(at + path.length + 2)
}

function toView(root: string, loaded: LoadedStandards): StandardsView {
  return {
    root,
    standards: loaded.standards.map((standard) => ({
      id: standard.id,
      title: standard.title,
      applies: standard.applies,
      why: standard.why,
      enabled: standard.enabled,
      source: standard.layers.at(-1)?.source ?? 'built-in',
      fields: ruleFields(standard),
    })),
    invalid: loaded.invalid.map(({ path, error }) => ({
      path,
      message: withoutPath(error.message, path),
    })),
    agents: loaded.agents,
  }
}

// The standards of the repository a directory is in, for the Standards page and the Git section
export function createStandardsService(options: StandardsServiceOptions) {
  const { configDir, appVersion, match, logger } = options
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS
  const now = options.now ?? Date.now
  const fs = options.fs ? { fs: options.fs } : {}
  const files = createStandardFiles(fs)
  // Reading the standards on every panel cycle would be expensive; they hold for a few seconds
  const cache = new Map<string, CacheEntry>()

  // The same folders the CLI reads, so the window and `dck` always agree
  const workspaceOf = (root: string) =>
    createStandardsWorkspace({
      finder: createFileExtensionFinder({
        installedDir: join(configDir, 'extensions'),
        globalDir: configDir,
        repositoryDir: join(root, '.dck'),
        implicit: {
          apiVersion: EXTENSION_API_VERSION,
          appVersion,
          points: { standards: 'standards' },
        },
        logger,
        ...fs,
      }),
      files,
      disabled: async () => new Set(options.disabled()),
      appVersion,
      repositoryRoot: root,
      globalDir: configDir,
      join,
    })

  async function load(root: string) {
    const loaded = await workspaceOf(root).load()
    const signature = JSON.stringify(
      loaded.standards.map(({ id, applies, enabled, check }) => [id, applies, enabled, check]),
    )
    const previous = cache.get(root)
    const checked = previous?.signature === signature ? previous.checked : new Map()
    const entry: CacheEntry = { at: now(), signature, standards: loaded.standards, checked }
    cache.set(root, entry)
    return { loaded, entry }
  }

  async function change(
    cwd: string,
    action: string,
    write: (workspace: StandardsWorkspace) => Promise<Result<void, ErrorBody> | void>,
  ): Promise<StandardsChange> {
    const root = await findRepositoryRoot(cwd, options.fs)
    if (root === undefined) return fail(errorBody('DCK-STD-003', cwd))
    try {
      const result = await write(workspaceOf(root))
      if (result && !result.ok) return result
      logger.info('standards changed', { root, action })
    } catch (error) {
      logger.warn('could not write the standards', { root, action, error: String(error) })
      return fail(errorBody('DCK-STD-002', String(error)))
    } finally {
      cache.delete(root)
    }
    return ok(toView(root, (await load(root)).loaded))
  }

  function failuresOf(entry: CacheEntry, application: string, text: string, firstLineOnly = false) {
    const key = `${application}\n${text}`
    const known = entry.checked.get(key)
    if (known) return known
    const messages = checkText(entry.standards, application, text, { match, firstLineOnly }).map(
      (failure) => failure.message,
    )
    if (entry.checked.size >= CHECKED_MAX) entry.checked.clear()
    entry.checked.set(key, messages)
    return messages
  }

  async function marksOf(git: Pick<GitStatus, 'root' | 'branch' | 'outgoing'>) {
    const cached = cache.get(git.root)
    const entry = cached && now() - cached.at < ttl ? cached : (await load(git.root)).entry
    const branch = git.branch === undefined ? [] : failuresOf(entry, 'branch', git.branch)
    // The panel only has the subject of a commit, so only the first line rules can judge it
    const commits = Object.fromEntries(
      git.outgoing
        .map((commit) => [commit.hash, failuresOf(entry, 'commit', commit.subject, true)] as const)
        .filter(([, messages]) => messages.length > 0),
    )
    return branch.length === 0 && Object.keys(commits).length === 0
      ? undefined
      : { branch, commits }
  }

  return {
    // Undefined when the directory is not inside a git repository
    async view(cwd: string): Promise<StandardsView | undefined> {
      const root = await findRepositoryRoot(cwd, options.fs)
      return root === undefined ? undefined : toView(root, (await load(root)).loaded)
    },

    setEnabled: (cwd: string, id: string, enabled: boolean) =>
      change(cwd, 'set-enabled', (workspace) => workspace.setEnabled(id, enabled, 'repository')),

    setField: (cwd: string, id: string, rule: number, name: string, value: string | number) =>
      change(cwd, 'set-field', (workspace) =>
        workspace.setField(id, rule, name, value, 'repository'),
      ),

    shareWithAgents: (cwd: string, on: boolean) =>
      change(cwd, on ? 'share-with-agents' : 'stop-sharing', (workspace) =>
        workspace.shareWithAgents(on),
      ),

    addClaudeImport: (cwd: string) =>
      change(cwd, 'add-claude-import', (workspace) => workspace.addClaudeImport()),

    // Undefined when the branch and every commit not pushed yet are inside the enabled standards
    async marks(
      git: Pick<GitStatus, 'root' | 'branch' | 'outgoing'>,
    ): Promise<StandardMarks | undefined> {
      try {
        return await marksOf(git)
      } catch (error) {
        logger.warn('could not check the standards', { root: git.root, error: String(error) })
        return undefined
      }
    },
  }
}

export type StandardsService = ReturnType<typeof createStandardsService>
