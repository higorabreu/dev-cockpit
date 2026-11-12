import type { z } from 'zod'
import { EXTENSION_SOURCES, type ExtensionSource } from '../extensions/load.ts'
import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import { type CompiledRule, compileRule } from './rules.ts'
import { frontMatterSchema, type Standard } from './standard.ts'

// One standard file as an adapter read it: the core never reads a file and never parses YAML
export interface StandardFile {
  readonly source: ExtensionSource
  readonly extension: string
  readonly path: string
  readonly frontMatter: unknown
  readonly body: string
  // Why the adapter could not read the file, which is then reported with its path
  readonly problem?: string
}

export type StandardLayer = Pick<StandardFile, 'source' | 'extension' | 'path'>

export interface ResolvedStandard extends Standard {
  // Every file that formed the standard, lowest first: the last one won, the others were overridden
  readonly layers: readonly StandardLayer[]
  // The `check` list compiled once, so checking a text never throws
  readonly rules: readonly CompiledRule[]
}

export interface InvalidStandard {
  readonly path: string
  readonly source: ExtensionSource
  readonly error: ErrorBody
}

export interface ResolvedStandards {
  readonly standards: readonly ResolvedStandard[]
  readonly invalid: readonly InvalidStandard[]
}

type FrontMatter = z.infer<typeof frontMatterSchema>

interface ParsedFile {
  readonly file: StandardFile
  readonly frontMatter: FrontMatter
}

const rank = (source: ExtensionSource) => EXTENSION_SOURCES.indexOf(source)

// Why a file cannot be used: what the adapter met, a missing front matter, or the first schema issues
function problemOf(file: StandardFile, error: z.ZodError | undefined): string {
  if (file.problem !== undefined) return file.problem
  if (file.frontMatter === undefined) return 'no front matter between two --- lines'
  return (error?.issues ?? [])
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'front matter'}: ${issue.message}`)
    .join('; ')
}

// A higher file replaces each field it declares; `check` and a non-blank body are replaced as a whole
function merge(layers: readonly ParsedFile[], path: string): Result<ResolvedStandard, ErrorBody> {
  const merged: Partial<FrontMatter> = {}
  for (const layer of layers) Object.assign(merged, layer.frontMatter)
  const { id, title, applies, why, check = [] } = merged
  if (id === undefined || title === undefined || applies === undefined || why === undefined) {
    const missing = (['title', 'applies', 'why'] as const).filter((field) => !merged[field])
    const detail = missing.map((field) => `${field}: required`).join('; ')
    return fail(errorBody('DCK-STD-001', `${path}: ${detail}`))
  }
  const rules: CompiledRule[] = []
  for (const [index, rule] of check.entries()) {
    const compiled = compileRule(rule, `${path}: check.${index}`)
    if (!compiled.ok) return compiled
    rules.push(compiled.value)
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
    rules,
  })
}

// Files with the same id are layered from the lowest to the highest source, in the given order within one
export function resolveStandards(files: readonly StandardFile[]): ResolvedStandards {
  const invalid: InvalidStandard[] = []
  const byId = new Map<string, ParsedFile[]>()
  for (const file of [...files].sort((a, b) => rank(a.source) - rank(b.source))) {
    const parsed = frontMatterSchema.safeParse(file.frontMatter)
    if (file.problem !== undefined || !parsed.success) {
      const error = errorBody('DCK-STD-001', `${file.path}: ${problemOf(file, parsed.error)}`)
      invalid.push({ path: file.path, source: file.source, error })
      continue
    }
    const id = parsed.data.id
    byId.set(id, [...(byId.get(id) ?? []), { file, frontMatter: parsed.data }])
  }

  const standards: ResolvedStandard[] = []
  for (const layers of byId.values()) {
    // An incomplete or broken standard is reported against the file that had the last word
    const highest = layers.at(-1)
    if (highest === undefined) continue
    const { path, source } = highest.file
    const result = merge(layers, path)
    if (result.ok) standards.push(result.value)
    else invalid.push({ path, source, error: result.error })
  }
  return { standards: standards.sort((a, b) => a.id.localeCompare(b.id)), invalid }
}
