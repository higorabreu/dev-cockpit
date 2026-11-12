import { join } from 'node:path'
import {
  createFileExtensionFinder,
  createRuleFiles,
  findRepositoryRoot,
} from '@dck/adapter-extension-files'
import {
  type CompiledCheck,
  checkText,
  createRulesWorkspace,
  type ErrorBody,
  EXTENSION_API_VERSION,
  enabledFor,
  errorBody,
  fail,
  type GitStatus,
  type LoadedRules,
  type Logger,
  type Matcher,
  ok,
  type ResolvedRule,
  type Result,
  type RuleMark,
  type RuleMarks,
  type RulesChange,
  type RulesView,
  type RulesWorkspace,
  ruleFields,
} from '@dck/core'

const DEFAULT_TTL_MS = 5000
const CHECKED_MAX = 500

export interface RulesServiceOptions {
  // The app's data folder, which holds the extensions folder and the user's own rules
  readonly configDir: string
  readonly appVersion: string
  // The ids in the `extensions.disabled` setting
  disabled(): readonly string[]
  // Comes with a time limit: an expression from a repository file must never hang the window
  readonly match: Matcher
  readonly logger: Logger
  readonly ttlMs?: number
  readonly now?: () => number
}

interface CacheEntry {
  readonly at: number
  // The checks as text: while they stay the same, a text already checked is not checked again
  readonly signature: string
  readonly rules: readonly ResolvedRule[]
  readonly checked: Map<string, RuleMark>
  // Expressions that ran out of time once: the panel polls, so they are not run again for this entry
  readonly slow: Set<RegExp>
}

// The failure detail already names the file, and the page shows the path beside it
function withoutPath(message: string, path: string): string {
  const at = message.indexOf(`${path}: `)
  return at === -1 ? message : message.slice(at + path.length + 2)
}

function toView(root: string, loaded: LoadedRules): RulesView {
  return {
    root,
    rules: loaded.rules.map((rule) => ({
      id: rule.id,
      title: rule.title,
      applies: rule.applies,
      why: rule.why,
      enabled: rule.enabled,
      source: rule.layers.at(-1)?.source ?? 'built-in',
      fields: ruleFields(rule),
    })),
    invalid: loaded.invalid.map(({ path, error }) => ({
      path,
      message: withoutPath(error.message, path),
    })),
    agents: loaded.agents,
  }
}

// The rules of the repository a directory is in, for the Harness page and the Git section
export function createRulesService(options: RulesServiceOptions) {
  const { configDir, appVersion, match, logger } = options
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS
  const now = options.now ?? Date.now
  const files = createRuleFiles({ logger })
  // Reading the rules on every panel cycle would be expensive; they hold for a few seconds
  const cache = new Map<string, CacheEntry>()

  // The same folders the CLI reads, so the window and `dck` always agree
  const workspaceOf = (root: string) =>
    createRulesWorkspace({
      finder: createFileExtensionFinder({
        installedDir: join(configDir, 'extensions'),
        globalDir: configDir,
        repositoryDir: join(root, '.dck'),
        implicit: {
          apiVersion: EXTENSION_API_VERSION,
          appVersion,
          points: { rules: 'rules' },
        },
        logger,
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
      loaded.rules.map(({ id, applies, enabled, check }) => [id, applies, enabled, check]),
    )
    const previous = cache.get(root)
    const same = previous?.signature === signature
    const entry: CacheEntry = {
      at: now(),
      signature,
      rules: loaded.rules,
      checked: same ? previous.checked : new Map(),
      slow: same ? previous.slow : new Set(),
    }
    cache.set(root, entry)
    return { loaded, entry }
  }

  async function change(
    cwd: string,
    action: string,
    write: (workspace: RulesWorkspace) => Promise<Result<void, ErrorBody>>,
  ): Promise<RulesChange> {
    const root = await findRepositoryRoot(cwd)
    if (root === undefined) return fail(errorBody('DCK-RUL-003', cwd))
    const result = await write(workspaceOf(root))
    cache.delete(root)
    if (!result.ok) return result
    logger.info('rules changed', { root, action })
    return ok(toView(root, (await load(root)).loaded))
  }

  const isSlow = (entry: CacheEntry, check: CompiledCheck) =>
    check.kind !== 'maxLength' && entry.slow.has(check.expression)

  function markOf(entry: CacheEntry, application: string, text: string, firstLineOnly = false) {
    const key = `${application}\n${text}`
    const known = entry.checked.get(key)
    if (known) return known
    const timed: Matcher = (expression, value) => {
      const result = match(expression, value)
      if (result === 'timeout') entry.slow.add(expression)
      return result
    }
    const applies = (check: CompiledCheck) => !firstLineOnly || check.scope === 'first-line'
    const skipped = enabledFor(entry.rules, application).flatMap((rule) =>
      rule.checks.filter((check) => applies(check) && isSlow(entry, check)),
    )
    const rules = entry.rules.map((rule) => ({
      ...rule,
      checks: rule.checks.filter((check) => !isSlow(entry, check)),
    }))
    const failures = checkText(rules, application, text, { match: timed, firstLineOnly })
    const mark: RuleMark = {
      failed: failures.filter(({ kind }) => kind !== 'timeout').map(({ message }) => message),
      slow: [
        ...skipped.map(({ message }) => message),
        ...failures.filter(({ kind }) => kind === 'timeout').map(({ message }) => message),
      ],
    }
    if (entry.checked.size >= CHECKED_MAX) entry.checked.clear()
    entry.checked.set(key, mark)
    return mark
  }

  const isEmpty = (mark: RuleMark) => mark.failed.length === 0 && mark.slow.length === 0

  async function marksOf(git: Pick<GitStatus, 'root' | 'branch' | 'outgoing'>) {
    const cached = cache.get(git.root)
    const entry = cached && now() - cached.at < ttl ? cached : (await load(git.root)).entry
    const branch = git.branch === undefined ? undefined : markOf(entry, 'branch', git.branch)
    // The panel only has the subject of a commit, so only the first line checks can judge it
    const commits = Object.fromEntries(
      git.outgoing
        .map((commit) => [commit.hash, markOf(entry, 'commit', commit.subject, true)] as const)
        .filter(([, mark]) => !isEmpty(mark)),
    )
    const marked = branch !== undefined && !isEmpty(branch)
    if (!marked && Object.keys(commits).length === 0) return undefined
    return marked ? { branch, commits } : { commits }
  }

  return {
    // Undefined when the directory is not inside a git repository
    async view(cwd: string): Promise<RulesView | undefined> {
      const root = await findRepositoryRoot(cwd)
      return root === undefined ? undefined : toView(root, (await load(root)).loaded)
    },

    setEnabled: (cwd: string, id: string, enabled: boolean) =>
      change(cwd, 'set-enabled', (workspace) => workspace.setEnabled(id, enabled, 'repository')),

    setField: (cwd: string, id: string, check: number, name: string, value: string | number) =>
      change(cwd, 'set-field', (workspace) =>
        workspace.setField(id, check, name, value, 'repository'),
      ),

    shareWithAgents: (cwd: string, on: boolean) =>
      change(cwd, on ? 'share-with-agents' : 'stop-sharing', (workspace) =>
        workspace.shareWithAgents(on),
      ),

    addClaudeImport: (cwd: string) =>
      change(cwd, 'add-claude-import', (workspace) => workspace.addClaudeImport()),

    // Undefined when the branch and every commit not pushed yet are inside the enabled rules
    async marks(
      git: Pick<GitStatus, 'root' | 'branch' | 'outgoing'>,
    ): Promise<RuleMarks | undefined> {
      try {
        return await marksOf(git)
      } catch (error) {
        logger.warn('could not check the rules', { root: git.root, error: String(error) })
        return undefined
      }
    },
  }
}

export type RulesService = ReturnType<typeof createRulesService>
