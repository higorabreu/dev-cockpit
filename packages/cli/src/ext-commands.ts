import {
  builtInExtension,
  CONTRIBUTION_POINTS,
  EXTENSION_API_VERSION,
  EXTENSION_SOURCES,
  type ExtensionFinder,
  type LoadedExtension,
  type LoadReport,
  loadExtensions,
  type Translate,
} from '@dck/core'
import { align, EXIT, type Io, rejection } from './output.ts'

export interface ExtDeps {
  readonly finder: ExtensionFinder
  // The ids in the `extensions.disabled` setting
  disabled(): Promise<ReadonlySet<string>>
  readonly appVersion: string
}

const byPrecedence = (a: LoadedExtension, b: LoadedExtension) =>
  EXTENSION_SOURCES.indexOf(a.source) - EXTENSION_SOURCES.indexOf(b.source) ||
  a.manifest.id.localeCompare(b.manifest.id)

export function formatExtensionList(report: LoadReport, t: Translate): string[] {
  const source = (extension: { source: LoadedExtension['source'] }) =>
    t(`cli.ext.source.${extension.source}`)
  const row = (extension: LoadedExtension, state: string, location: string[] = []) => [
    extension.manifest.id,
    extension.manifest.version,
    source(extension),
    state,
    ...location,
  ]
  const disabled = new Set(report.disabled)
  const winners = [...report.active, ...report.disabled]
    .sort(byPrecedence)
    .map((extension) =>
      row(
        extension,
        t(disabled.has(extension) ? 'cli.ext.state.disabled' : 'cli.ext.state.active'),
      ),
    )
  // A shadowed row also says where it is, because that is the copy the user may want to remove
  const shadowed = [...report.shadowed]
    .sort((a, b) => byPrecedence(a.extension, b.extension))
    .map(({ extension, by }) =>
      row(extension, t('cli.ext.state.shadowed', { source: source(by) }), [extension.location]),
    )
  const lines = align([...winners, ...shadowed])
  if (report.rejected.length === 0) return lines
  const rejected = align(
    report.rejected.map((entry) => [entry.location, source(entry), rejection(entry.error, t)]),
  )
  const separator = lines.length === 0 ? [] : ['']
  return [...lines, ...separator, t('cli.ext.rejected'), ...rejected.map((line) => `  ${line}`)]
}

async function list(io: Io, deps: ExtDeps): Promise<number> {
  const [found, disabled] = await Promise.all([deps.finder.find(), deps.disabled()])
  const report = loadExtensions({
    candidates: [builtInExtension(deps.appVersion), ...found],
    points: CONTRIBUTION_POINTS,
    disabled,
    apiVersion: EXTENSION_API_VERSION,
    appVersion: deps.appVersion,
  })
  // A refused extension is part of the report, not a failure of the command
  io.out(`${formatExtensionList(report, io.t).join('\n')}\n`)
  return EXIT.ok
}

export async function runExtCommand(
  args: readonly string[],
  io: Io,
  deps: ExtDeps,
): Promise<number> {
  const [subcommand, ...rest] = args
  if (subcommand === 'list' && rest.length === 0) return list(io, deps)
  io.err(`${io.t('cli.ext.usage')}\n`)
  return subcommand === '--help' ? EXIT.ok : EXIT.usage
}
