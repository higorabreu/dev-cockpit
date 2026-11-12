import {
  builtInExtension,
  CONTRIBUTION_POINTS,
  EXTENSION_API_VERSION,
  RULES_POINT,
} from '../extensions/built-in.ts'
import { contributionsFor, loadExtensions } from '../extensions/load.ts'
import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import type { ExtensionFinder } from '../ports/extension-finder.ts'
import type { RuleFiles } from '../ports/rule-files.ts'
import { fail, ok, type Result } from '../result.ts'
import { blockText, removeBlock, upsertBlock } from './block.ts'
import { builtInRuleFiles } from './examples.ts'
import { withRuleField } from './fields.ts'
import { formatRuleFile } from './format.ts'
import { renderBlock } from './guide.ts'
import { type ResolvedRule, type ResolvedRules, type RuleFile, resolveRules } from './resolve.ts'
import type { Rule } from './rule.ts'

export interface RulesWorkspaceDeps {
  readonly finder: ExtensionFinder
  readonly files: RuleFiles
  // The ids in the `extensions.disabled` setting
  disabled(): Promise<ReadonlySet<string>>
  readonly appVersion: string
  readonly repositoryRoot: string
  // The app's config directory, which holds the user's own `rules` folder
  readonly globalDir: string
  // Comes in because the core cannot import `node:path`
  join(...parts: string[]): string
}

// Where a change is written: the repository's `.dck/rules` or the user's own folder
export type RulesTarget = 'repository' | 'global'

export interface AgentsFileState {
  readonly file: string
  // The marked block is in the file
  readonly shared: boolean
  // The block is there and no longer says what the rules say
  readonly stale: boolean
  // A CLAUDE.md exists and does not import the file, so Claude Code would not read the block
  readonly claudeImportMissing: boolean
}

export interface LoadedRules extends ResolvedRules {
  readonly agents: AgentsFileState
}

const CLAUDE_IMPORT = '@AGENTS.md'
// Claude Code imports `@AGENTS.md` or `@./AGENTS.md` on a line of its own or within a sentence
const importsAgents = (text: string) => /(^|\s)@(\.\/)?AGENTS\.md(?=\s|$)/.test(text)

// The one place the CLI and the window read and change the rules from
export function createRulesWorkspace(deps: RulesWorkspaceDeps) {
  const { files, join, appVersion } = deps
  const agentsFile = join(deps.repositoryRoot, 'AGENTS.md')
  const claudeFile = join(deps.repositoryRoot, 'CLAUDE.md')
  const roots: Record<RulesTarget, string> = {
    repository: deps.repositoryRoot,
    global: deps.globalDir,
  }
  const folders: Record<RulesTarget, string> = {
    repository: join(deps.repositoryRoot, '.dck', 'rules'),
    global: join(deps.globalDir, 'rules'),
  }

  // Without the files of `leftOut`, so what is written to one folder never copies text from the other
  async function resolve(leftOut?: RulesTarget): Promise<ResolvedRules> {
    const report = loadExtensions({
      candidates: [builtInExtension(appVersion), ...(await deps.finder.find())],
      points: CONTRIBUTION_POINTS,
      disabled: await deps.disabled(),
      apiVersion: EXTENSION_API_VERSION,
      appVersion,
    })
    const found: RuleFile[] = []
    for (const { extension, declaration } of contributionsFor(report, RULES_POINT)) {
      const { source, location, manifest } = extension
      if (source === leftOut) continue
      // The built-in examples are data in the core, not files on disk
      if (source === 'built-in') found.push(...builtInRuleFiles())
      else {
        const listed = await files.list(join(location, declaration))
        found.push(...listed.map((file) => ({ ...file, source, extension: manifest.id })))
      }
    }
    return resolveRules(found)
  }

  // A file of the target folder that already holds this id is rewritten, whatever its name
  const fileFor = (rule: Pick<ResolvedRule, 'id' | 'layers'>, target: RulesTarget) =>
    rule.layers.findLast((layer) => layer.source === target)?.path ??
    join(folders[target], `${rule.id}.md`)

  // The block is versioned with the team, so it only states what the repository itself holds
  const blockOf = (resolved: ResolvedRules) =>
    renderBlock(resolved.rules.filter((rule) => rule.layers.at(-1)?.source === 'repository'))

  // Writes the complete rule, so the folder says all that applies and does not depend on the app version
  async function change(
    id: string,
    target: RulesTarget,
    edit: (rule: Rule) => Result<Rule, ErrorBody>,
  ): Promise<Result<void, ErrorBody>> {
    const leftOut = target === 'repository' ? 'global' : 'repository'
    const rule = (await resolve(leftOut)).rules.find((candidate) => candidate.id === id)
    if (rule === undefined) return fail(errorBody('DCK-RUL-005', id))
    const edited = edit(rule)
    if (!edited.ok) return edited
    const path = fileFor(rule, target)
    // The default name may already hold an invalid file or another rule, which is never overwritten
    if (!rule.layers.some((layer) => layer.path === path)) {
      const existing = await files.readText(path)
      if (!existing.ok || existing.value !== undefined) {
        return fail(errorBody('DCK-RUL-001', `${path}: already holds something other than ${id}`))
      }
    }
    return files.writeText(path, formatRuleFile(edited.value), roots[target])
  }

  // A file that cannot be read is treated as missing when only shown, and is never changed
  const readIfPossible = async (path: string) => {
    const read = await files.readText(path)
    return read.ok ? read.value : undefined
  }

  async function load(): Promise<LoadedRules> {
    const resolved = await resolve()
    const text = (await readIfPossible(agentsFile)) ?? ''
    const claude = await readIfPossible(claudeFile)
    const current = blockText(text)
    const shared = current !== undefined
    return {
      ...resolved,
      agents: {
        file: agentsFile,
        shared,
        stale: shared && current !== blockOf(await resolve('global')).trim(),
        claudeImportMissing: claude !== undefined && !importsAgents(claude),
      },
    }
  }

  // On writes or refreshes the marked block of AGENTS.md, off removes it; the text around it is kept
  async function shareWithAgents(on: boolean): Promise<Result<void, ErrorBody>> {
    const read = await files.readText(agentsFile)
    if (!read.ok) return read
    const text = read.value ?? ''
    const block = on ? blockOf(await resolve('global')) : ''
    // A block with no line would tell an agent nothing: an existing one goes away, a new one is refused
    const shared = blockText(text) !== undefined
    if (on && block === '' && !shared) return fail(errorBody('DCK-RUL-004'))
    const next = on && block !== '' ? upsertBlock(text, block) : removeBlock(text)
    return next === text ? ok(undefined) : files.writeText(agentsFile, next, deps.repositoryRoot)
  }

  return {
    // Where a change to the rule is written, so a caller can say it before it asks
    fileFor,
    load,
    shareWithAgents,

    // The block is dck's own and was approved when shared, so it follows a rule change; true when written
    async refreshShared(): Promise<Result<boolean, ErrorBody>> {
      if (!(await load()).agents.stale) return ok(false)
      const shared = await shareWithAgents(true)
      return shared.ok ? ok(true) : shared
    },

    setEnabled: (id: string, enabled: boolean, target: RulesTarget) =>
      change(id, target, (rule) => ok({ ...rule, enabled })),

    setField: (
      id: string,
      check: number,
      name: string,
      value: string | number,
      target: RulesTarget,
    ) =>
      change(id, target, (rule) => {
        const edited = withRuleField(rule.check, check, name, value)
        return edited.ok ? ok({ ...rule, check: edited.value }) : edited
      }),

    // Only an existing CLAUDE.md gets the import: creating one is the user's choice
    async addClaudeImport(): Promise<Result<void, ErrorBody>> {
      const read = await files.readText(claudeFile)
      if (!read.ok) return read
      const text = read.value
      if (text === undefined || importsAgents(text)) return ok(undefined)
      const gap = text === '' || text.endsWith('\n') ? '' : '\n'
      return files.writeText(claudeFile, `${text}${gap}${CLAUDE_IMPORT}\n`, deps.repositoryRoot)
    },
  }
}

export type RulesWorkspace = ReturnType<typeof createRulesWorkspace>
