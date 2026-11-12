import {
  builtInExtension,
  CONTRIBUTION_POINTS,
  describeError,
  type ErrorBody,
  EXTENSION_API_VERSION,
  EXTENSION_SOURCES,
  type ExtensionFinder,
  errorCodeOf,
  type LoadedExtension,
  type LoadReport,
  loadExtensions,
  type Translate,
} from '@dck/core'

export interface ExtDeps {
  readonly finder: ExtensionFinder
  // The ids in the `extensions.disabled` setting
  disabled(): Promise<ReadonlySet<string>>
  readonly appVersion: string
}

interface Io {
  out(text: string): void
  err(text: string): void
  readonly t: Translate
}

const EXIT_OK = 0
const EXIT_USAGE = 64

const byPrecedence = (a: LoadedExtension, b: LoadedExtension) =>
  EXTENSION_SOURCES.indexOf(a.source) - EXTENSION_SOURCES.indexOf(b.source) ||
  a.manifest.id.localeCompare(b.manifest.id)

// Pads every column but the last to its widest cell, so the rows line up without a frame
function align(rows: readonly (readonly string[])[]): string[] {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, column) => {
      widths[column] = Math.max(widths[column] ?? 0, cell.length)
    })
  }
  return rows.map((row) =>
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join('  ')
      .trimEnd(),
  )
}

// An ErrorBody carries the English message and the detail as one text; the listing translates the message
function detailOf(error: ErrorBody): string {
  const prefix = `${describeError(errorCodeOf(error))}: `
  return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : ''
}

function rejection(error: ErrorBody, t: Translate): string {
  const message = t(`error.${errorCodeOf(error)}`)
  const detail = detailOf(error)
  return detail === '' ? message : `${message}: ${detail}`
}

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
  return [...lines, '', t('cli.ext.rejected'), ...rejected.map((line) => `  ${line}`)]
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
  return EXIT_OK
}

export async function runExtCommand(
  args: readonly string[],
  io: Io,
  deps: ExtDeps,
): Promise<number> {
  const [subcommand, ...rest] = args
  if (subcommand === 'list' && rest.length === 0) return list(io, deps)
  io.err(`${io.t('cli.ext.usage')}\n`)
  return EXIT_USAGE
}
