import type { PathKind, ResolvedPath } from '@dck/core'
import type { IBuffer, ILink, Terminal } from '@xterm/xterm'
import { findPathCandidates, type PathCandidate } from './path-candidates.ts'
import type { FilePlace } from './path-open.ts'
import {
  type CellRange,
  hideLinkTip,
  type LinkHint,
  type LinkModifier,
  type LinkOptions,
  opensLink,
  showLinkTip,
} from './terminal-links.ts'

export interface PathLinkOptions {
  readonly modifier: LinkModifier
  // The held clicks of a file or a folder, read on every hover: the language or the setting may change
  hint(kind: Exclude<PathKind, 'missing'>): LinkHint
  // The path as the tooltip writes it, from the tab's project
  shown(path: string): string
  // The tab's current directory, for relative paths; unknown right after the tab opens
  cwd(): string | undefined
  resolve(base: string | undefined, paths: readonly string[]): Promise<readonly ResolvedPath[]>
  // `alternate`: Shift was held too, which opens it the other way (D84)
  openFile(path: string, place: FilePlace, alternate: boolean): void
  // A folder offers a choice, shown where the click happened
  openFolder(path: string, x: number, y: number): void
  tip: LinkOptions['tip']
}

// 1-based like xterm's ranges; a wide character takes two cells
interface Cell {
  readonly x: number
  readonly y: number
  readonly width: number
}

export interface LogicalLine {
  readonly text: string
  // The cell of each UTF-16 unit of the text
  readonly cells: readonly Cell[]
}

type LineSource = Pick<IBuffer, 'getLine'>

// A long path wraps over several rows; past this it is not worth reading the line
const MAX_ROWS = 16
const MAX_CANDIDATES = 50
const CACHE_MS = 2000
const CACHE_ENTRIES = 64

// The rows that wrap into the hovered one, joined, so a wrapped path is still one link
export function readLogicalLine(buffer: LineSource, bufferLineNumber: number): LogicalLine {
  let first = bufferLineNumber - 1
  while (first > 0 && bufferLineNumber - first < MAX_ROWS && buffer.getLine(first)?.isWrapped)
    first -= 1
  let text = ''
  const cells: Cell[] = []
  for (let row = first; row < first + MAX_ROWS; row++) {
    const line = buffer.getLine(row)
    if (!line || (row > first && !line.isWrapped)) break
    for (let x = 0; x < line.length; x++) {
      const cell = line.getCell(x)
      const width = cell?.getWidth() ?? 1
      // The second half of a wide character has no text of its own
      if (width === 0) continue
      const chars = cell?.getChars() || ' '
      text += chars
      for (let unit = 0; unit < chars.length; unit++) cells.push({ x: x + 1, y: row + 1, width })
    }
  }
  return { text, cells }
}

export function candidateRange(line: LogicalLine, candidate: PathCandidate): CellRange | undefined {
  const first = line.cells[candidate.start]
  const last = line.cells[candidate.end - 1]
  if (!first || !last) return undefined
  return { start: { x: first.x, y: first.y }, end: { x: last.x + last.width - 1, y: last.y } }
}

// Moving the mouse over the same output asks again and again; the disk is read once in a while
export function createResolveCache(
  resolve: PathLinkOptions['resolve'],
  now: () => number = Date.now,
) {
  const entries = new Map<string, { at: number; result: Promise<readonly ResolvedPath[]> }>()
  return (base: string | undefined, paths: readonly string[]) => {
    const key = `${base ?? ''}\n${paths.join('\n')}`
    const cached = entries.get(key)
    if (cached && now() - cached.at < CACHE_MS) return cached.result
    for (const [old, entry] of entries) if (now() - entry.at >= CACHE_MS) entries.delete(old)
    if (entries.size >= CACHE_ENTRIES) entries.clear()
    const result = resolve(base, paths)
    entries.set(key, { at: now(), result })
    return result
  }
}

const placeOf = ({ line, column }: PathCandidate): FilePlace => ({
  ...(line === undefined ? {} : { line }),
  ...(column === undefined ? {} : { column }),
})

// The tooltip names the place the click goes to, as `acme/src/app.ts:12:5`
export function tipText(path: string, { line, column }: FilePlace): string {
  if (line === undefined) return path
  return column === undefined ? `${path}:${line}` : `${path}:${line}:${column}`
}

// Paths printed in the terminal become links only when they exist; a file opens, a folder offers a menu
export function attachPaths(terminal: Terminal, options: PathLinkOptions) {
  const resolve = createResolveCache(options.resolve)

  const linkFor = (line: LogicalLine, candidate: PathCandidate, target: ResolvedPath) => {
    const range = candidateRange(line, candidate)
    const { kind, path } = target
    if (!range || kind === 'missing') return []
    const place = kind === 'file' ? placeOf(candidate) : {}
    const link: ILink = {
      range,
      text: line.text.slice(candidate.start, candidate.end),
      activate(event) {
        if (!opensLink(event, options.modifier)) return
        if (kind === 'dir') options.openFolder(path, event.clientX, event.clientY)
        else options.openFile(path, place, event.shiftKey)
      },
      hover: () => {
        const text = tipText(options.shown(path), place)
        showLinkTip(terminal, options.tip, range, text, options.hint(kind), true)
      },
      leave: () => hideLinkTip(terminal, options.tip),
    }
    return [link]
  }

  return terminal.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      const line = readLogicalLine(terminal.buffer.active, bufferLineNumber)
      const candidates = findPathCandidates(line.text).slice(0, MAX_CANDIDATES)
      if (candidates.length === 0) return callback(undefined)
      const paths = [...new Set(candidates.map((candidate) => candidate.path))]
      resolve(options.cwd(), paths).then(
        (resolved) => {
          const byPath = new Map(paths.map((path, index) => [path, resolved[index]]))
          callback(
            candidates.flatMap((candidate) => {
              const target = byPath.get(candidate.path)
              return target ? linkFor(line, candidate, target) : []
            }),
          )
        },
        // The host did not answer: the line simply has no path links this time
        () => callback(undefined),
      )
    },
  })
}
