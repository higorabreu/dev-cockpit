import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import type { ContributionPoint } from './contribution-points.ts'
import { type Manifest, parseManifest } from './manifest.ts'
import { satisfies } from './version.ts'

// From the lowest to the highest precedence
export const EXTENSION_SOURCES = ['built-in', 'installed', 'global', 'repository'] as const
export type ExtensionSource = (typeof EXTENSION_SOURCES)[number]

export interface ExtensionCandidate {
  readonly source: ExtensionSource
  readonly location: string
  // Whatever the source read, validated here and never trusted
  readonly manifest: unknown
}

export interface LoadedExtension {
  readonly manifest: Manifest
  readonly source: ExtensionSource
  readonly location: string
  // What the extension declared for each contribution point it uses, already validated
  readonly declarations: ReadonlyMap<string, unknown>
}

export interface ShadowedExtension {
  readonly extension: LoadedExtension
  readonly by: LoadedExtension
}

export interface RejectedExtension {
  readonly source: ExtensionSource
  readonly location: string
  readonly error: ErrorBody
}

export interface LoadReport {
  // From the lowest to the highest precedence, so a consumer can fold them in order
  readonly active: readonly LoadedExtension[]
  readonly disabled: readonly LoadedExtension[]
  readonly shadowed: readonly ShadowedExtension[]
  readonly rejected: readonly RejectedExtension[]
}

export interface LoadOptions {
  readonly candidates: readonly ExtensionCandidate[]
  readonly points: readonly ContributionPoint<unknown>[]
  readonly disabled: ReadonlySet<string>
  // The manifest API version this build understands and the running app version
  readonly apiVersion: number
  readonly appVersion: string
}

// What ships with the app and the implicit folders use this owner, so an installed extension cannot replace them
const RESERVED_OWNER = 'dck.'

const rank = (source: ExtensionSource) => EXTENSION_SOURCES.indexOf(source)

function validate(
  candidate: ExtensionCandidate,
  options: LoadOptions,
): Result<LoadedExtension, ErrorBody> {
  const parsed = parseManifest(candidate.manifest)
  if (!parsed.ok) return parsed
  const manifest = parsed.value
  if (candidate.source === 'installed' && manifest.id.startsWith(RESERVED_OWNER)) {
    return fail(errorBody('DCK-EXT-001', `${manifest.id}: the dck owner is reserved`))
  }
  if (manifest.apiVersion !== options.apiVersion) {
    const detail = `${manifest.id} needs API ${manifest.apiVersion}, this version supports ${options.apiVersion}`
    return fail(errorBody('DCK-EXT-003', detail))
  }
  if (!satisfies(options.appVersion, manifest.engines.dck)) {
    const detail = `${manifest.id} needs dck ${manifest.engines.dck}, this is ${options.appVersion}`
    return fail(errorBody('DCK-EXT-003', detail))
  }
  const declarations = new Map<string, unknown>()
  for (const [pointId, declaration] of Object.entries(manifest.contributes)) {
    const point = options.points.find((candidatePoint) => candidatePoint.id === pointId)
    if (point === undefined) {
      return fail(
        errorBody('DCK-EXT-002', `${manifest.id} uses an unknown contribution point: ${pointId}`),
      )
    }
    if (point.sources !== undefined && !point.sources.includes(candidate.source)) {
      const allowed = point.sources.join(', ')
      const detail = `${manifest.id} contributes ${pointId}, which only ${allowed} extensions can do in this version`
      return fail(errorBody('DCK-EXT-002', detail))
    }
    const checked = point.schema.safeParse(declaration)
    if (!checked.success) {
      const reason = checked.error.issues[0]?.message ?? 'invalid'
      return fail(errorBody('DCK-EXT-001', `${manifest.id} contributes.${pointId}: ${reason}`))
    }
    declarations.set(pointId, checked.data)
  }
  return ok({ manifest, source: candidate.source, location: candidate.location, declarations })
}

const byPrecedence = (a: LoadedExtension, b: LoadedExtension) =>
  rank(a.source) - rank(b.source) || a.manifest.id.localeCompare(b.manifest.id)

// The same id from several sources: the highest source wins and the others are listed as shadowed
export function loadExtensions(options: LoadOptions): LoadReport {
  const rejected: RejectedExtension[] = []
  const byId = new Map<string, LoadedExtension[]>()
  for (const candidate of options.candidates) {
    const result = validate(candidate, options)
    if (!result.ok) {
      rejected.push({ source: candidate.source, location: candidate.location, error: result.error })
      continue
    }
    const id = result.value.manifest.id
    byId.set(id, [...(byId.get(id) ?? []), result.value])
  }

  const winners: LoadedExtension[] = []
  const shadowed: ShadowedExtension[] = []
  for (const [id, group] of byId) {
    const [winner, ...others] = [...group].sort(
      (a, b) => rank(b.source) - rank(a.source) || a.location.localeCompare(b.location),
    )
    if (winner === undefined) continue
    winners.push(winner)
    for (const other of others) {
      if (other.source === winner.source) {
        const error = errorBody('DCK-EXT-001', `duplicate id ${id} in the same source`)
        rejected.push({ source: other.source, location: other.location, error })
      } else shadowed.push({ extension: other, by: winner })
    }
  }

  const ordered = winners.sort(byPrecedence)
  return {
    active: ordered.filter((extension) => !options.disabled.has(extension.manifest.id)),
    disabled: ordered.filter((extension) => options.disabled.has(extension.manifest.id)),
    shadowed,
    rejected,
  }
}

export interface Contribution<T> {
  readonly extension: LoadedExtension
  readonly declaration: T
}

// What the active extensions declared for one point, from the lowest to the highest precedence
export function contributionsFor<T>(
  report: LoadReport,
  point: ContributionPoint<T>,
): readonly Contribution<T>[] {
  return report.active.flatMap((extension) => {
    const checked = point.schema.safeParse(extension.declarations.get(point.id))
    return checked.success && extension.declarations.has(point.id)
      ? [{ extension, declaration: checked.data }]
      : []
  })
}
