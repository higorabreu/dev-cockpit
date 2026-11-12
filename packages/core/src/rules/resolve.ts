import type { z } from 'zod'
import { EXTENSION_SOURCES, type ExtensionSource } from '../extensions/load.ts'
import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import { type CompiledCheck, compileCheck } from './compile.ts'
import { frontMatterSchema, type Rule } from './rule.ts'

// One rule file as an adapter read it: the core never reads a file and never parses YAML
export interface RuleFile {
  readonly source: ExtensionSource
  readonly extension: string
  readonly path: string
  readonly frontMatter: unknown
  readonly body: string
  // Why the adapter could not read the file, which is then reported with its path
  readonly problem?: string
}

export type RuleLayer = Pick<RuleFile, 'source' | 'extension' | 'path'>

export interface ResolvedRule extends Rule {
  // Every file that formed the rule, lowest first: the last one won, the others were overridden
  readonly layers: readonly RuleLayer[]
  // The `check` list compiled once, so checking a text never throws
  readonly checks: readonly CompiledCheck[]
}

export interface InvalidRule {
  readonly path: string
  readonly source: ExtensionSource
  readonly error: ErrorBody
}

export interface ResolvedRules {
  readonly rules: readonly ResolvedRule[]
  readonly invalid: readonly InvalidRule[]
}

type FrontMatter = z.infer<typeof frontMatterSchema>

interface ParsedFile {
  readonly file: RuleFile
  readonly frontMatter: FrontMatter
}

const rank = (source: ExtensionSource) => EXTENSION_SOURCES.indexOf(source)

// Why a file cannot be used: what the adapter met, a missing front matter, or the first schema issues
function problemOf(file: RuleFile, error: z.ZodError | undefined): string {
  if (file.problem !== undefined) return file.problem
  if (file.frontMatter === undefined) return 'no front matter between two --- lines'
  return (error?.issues ?? [])
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'front matter'}: ${issue.message}`)
    .join('; ')
}

// A higher file replaces each field it declares; `check` and a non-blank body are replaced as a whole
function merge(layers: readonly ParsedFile[], path: string): Result<ResolvedRule, ErrorBody> {
  const merged: Partial<FrontMatter> = {}
  for (const layer of layers) Object.assign(merged, layer.frontMatter)
  const { id, title, applies, why, check = [] } = merged
  if (id === undefined || title === undefined || applies === undefined || why === undefined) {
    const missing = (['title', 'applies', 'why'] as const).filter((field) => !merged[field])
    const detail = missing.map((field) => `${field}: required`).join('; ')
    return fail(errorBody('DCK-RUL-001', `${path}: ${detail}`))
  }
  const checks: CompiledCheck[] = []
  for (const [index, entry] of check.entries()) {
    const compiled = compileCheck(entry, `${path}: check.${index}`)
    if (!compiled.ok) return compiled
    checks.push(compiled.value)
  }
  const bodies = layers.map((layer) => layer.file.body.trim()).filter((body) => body !== '')
  return ok({
    id,
    title,
    applies,
    paths: merged.paths ?? [],
    why,
    enabled: merged.enabled ?? true,
    check,
    body: bodies.at(-1) ?? '',
    layers: layers.map(({ file }) => ({
      source: file.source,
      extension: file.extension,
      path: file.path,
    })),
    checks,
  })
}

// Files with the same id are layered from the lowest to the highest source, in the given order within one
export function resolveRules(files: readonly RuleFile[]): ResolvedRules {
  const invalid: InvalidRule[] = []
  const byId = new Map<string, ParsedFile[]>()
  for (const file of [...files].sort((a, b) => rank(a.source) - rank(b.source))) {
    const parsed = frontMatterSchema.safeParse(file.frontMatter)
    if (file.problem !== undefined || !parsed.success) {
      const error = errorBody('DCK-RUL-001', `${file.path}: ${problemOf(file, parsed.error)}`)
      invalid.push({ path: file.path, source: file.source, error })
      continue
    }
    const id = parsed.data.id
    byId.set(id, [...(byId.get(id) ?? []), { file, frontMatter: parsed.data }])
  }

  const rules: ResolvedRule[] = []
  for (const layers of byId.values()) {
    // An incomplete or broken rule is reported against the file that had the last word
    const highest = layers.at(-1)
    if (highest === undefined) continue
    const { path, source } = highest.file
    const result = merge(layers, path)
    if (result.ok) rules.push(result.value)
    else invalid.push({ path, source, error: result.error })
  }
  return { rules: rules.sort((a, b) => a.id.localeCompare(b.id)), invalid }
}
