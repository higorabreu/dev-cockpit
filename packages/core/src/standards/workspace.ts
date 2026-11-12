import {
  builtInExtension,
  CONTRIBUTION_POINTS,
  EXTENSION_API_VERSION,
  STANDARDS_POINT,
} from '../extensions/built-in.ts'
import { contributionsFor, loadExtensions } from '../extensions/load.ts'
import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import type { ExtensionFinder } from '../ports/extension-finder.ts'
import type { StandardFiles } from '../ports/standard-files.ts'
import { fail, ok, type Result } from '../result.ts'
import { hasBlock, MARKDOWN_BLOCK, removeBlock, upsertBlock } from './block.ts'
import { builtInStandardFiles } from './examples.ts'
import { withRuleField } from './fields.ts'
import { formatStandardFile } from './format.ts'
import { renderBlock } from './guide.ts'
import {
  type ResolvedStandard,
  type ResolvedStandards,
  resolveStandards,
  type StandardFile,
} from './resolve.ts'
import type { Standard } from './standard.ts'

export interface StandardsWorkspaceDeps {
  readonly finder: ExtensionFinder
  readonly files: StandardFiles
  // The ids in the `extensions.disabled` setting
  disabled(): Promise<ReadonlySet<string>>
  readonly appVersion: string
  readonly repositoryRoot: string
  // The app's config directory, which holds the user's own `standards` folder
  readonly globalDir: string
  // Comes in because the core cannot import `node:path`
  join(...parts: string[]): string
}

// Where a change is written: the repository's `.dck/standards` or the user's own folder
export type StandardsTarget = 'repository' | 'global'

export interface AgentsFileState {
  readonly file: string
  // The marked block is in the file
  readonly shared: boolean
  // The block is there and no longer says what the standards say
  readonly stale: boolean
  // A CLAUDE.md exists and does not import the file, so Claude Code would not read the block
  readonly claudeImportMissing: boolean
}

export interface LoadedStandards extends ResolvedStandards {
  readonly agents: AgentsFileState
}

const CLAUDE_IMPORT = '@AGENTS.md'

// The one place the CLI and the window read and change the standards from
export function createStandardsWorkspace(deps: StandardsWorkspaceDeps) {
  const { files, join, appVersion } = deps
  const agentsFile = join(deps.repositoryRoot, 'AGENTS.md')
  const claudeFile = join(deps.repositoryRoot, 'CLAUDE.md')
  const folders: Record<StandardsTarget, string> = {
    repository: join(deps.repositoryRoot, '.dck', 'standards'),
    global: join(deps.globalDir, 'standards'),
  }

  async function resolve(): Promise<ResolvedStandards> {
    const report = loadExtensions({
      candidates: [builtInExtension(appVersion), ...(await deps.finder.find())],
      points: CONTRIBUTION_POINTS,
      disabled: await deps.disabled(),
      apiVersion: EXTENSION_API_VERSION,
      appVersion,
    })
    const found: StandardFile[] = []
    for (const { extension, declaration } of contributionsFor(report, STANDARDS_POINT)) {
      const { source, location, manifest } = extension
      // The built-in examples are data in the core, not files on disk
      if (source === 'built-in') found.push(...builtInStandardFiles())
      else {
        const listed = await files.list(join(location, declaration))
        found.push(...listed.map((file) => ({ ...file, source, extension: manifest.id })))
      }
    }
    return resolveStandards(found)
  }

  // A file of the target folder that already holds this id is rewritten, whatever its name
  const fileFor = (standard: Pick<ResolvedStandard, 'id' | 'layers'>, target: StandardsTarget) =>
    standard.layers.findLast((layer) => layer.source === target)?.path ??
    join(folders[target], `${standard.id}.md`)

  // The block is versioned with the team, so it only states what the repository itself holds
  const blockOf = (resolved: ResolvedStandards) =>
    renderBlock(
      resolved.standards.filter((standard) => standard.layers.at(-1)?.source === 'repository'),
    )

  // Writes the complete standard, so the folder says all that applies and does not depend on the app version
  async function change(
    id: string,
    target: StandardsTarget,
    edit: (standard: Standard) => Result<Standard, ErrorBody>,
  ): Promise<Result<void, ErrorBody>> {
    const standard = (await resolve()).standards.find((candidate) => candidate.id === id)
    if (standard === undefined) return fail(errorBody('DCK-STD-001', `${id}: no such standard`))
    const edited = edit(standard)
    if (!edited.ok) return edited
    await files.writeText(fileFor(standard, target), formatStandardFile(edited.value))
    return ok(undefined)
  }

  return {
    // Where a change to the standard is written, so a caller can say it before it asks
    fileFor,

    async load(): Promise<LoadedStandards> {
      const resolved = await resolve()
      const text = (await files.readText(agentsFile)) ?? ''
      const claude = await files.readText(claudeFile)
      const shared = hasBlock(text, MARKDOWN_BLOCK)
      const current = upsertBlock(text, blockOf(resolved), MARKDOWN_BLOCK)
      return {
        ...resolved,
        agents: {
          file: agentsFile,
          shared,
          stale: shared && current !== text,
          claudeImportMissing: claude !== undefined && !claude.includes(CLAUDE_IMPORT),
        },
      }
    },

    setEnabled: (id: string, enabled: boolean, target: StandardsTarget) =>
      change(id, target, (standard) => ok({ ...standard, enabled })),

    setField: (
      id: string,
      rule: number,
      name: string,
      value: string | number,
      target: StandardsTarget,
    ) =>
      change(id, target, (standard) => {
        const check = withRuleField(standard.check, rule, name, value)
        return check.ok ? ok({ ...standard, check: check.value }) : check
      }),

    // On writes or refreshes the marked block of AGENTS.md, off removes it; the text around it is kept
    async shareWithAgents(on: boolean): Promise<void> {
      const text = (await files.readText(agentsFile)) ?? ''
      const next = on
        ? upsertBlock(text, blockOf(await resolve()), MARKDOWN_BLOCK)
        : removeBlock(text, MARKDOWN_BLOCK)
      if (next !== text) await files.writeText(agentsFile, next)
    },

    // Only an existing CLAUDE.md gets the import: creating one is the user's choice
    async addClaudeImport(): Promise<void> {
      const text = await files.readText(claudeFile)
      if (text === undefined || text.includes(CLAUDE_IMPORT)) return
      const gap = text === '' || text.endsWith('\n') ? '' : '\n'
      await files.writeText(claudeFile, `${text}${gap}${CLAUDE_IMPORT}\n`)
    },
  }
}

export type StandardsWorkspace = ReturnType<typeof createStandardsWorkspace>
