import type { SettingsEdit, SettingsText, SettingsTextRead, TextPosition } from '@dck/core'
import {
  applyEdits,
  createScanner,
  type Edit,
  type FormattingOptions,
  format,
  getNodeValue,
  modify,
  type ParseError,
  parseTree,
  stripComments,
} from 'jsonc-parser'

const BOM = String.fromCharCode(0xfeff)

function positionOf(text: string, offset: number): TextPosition {
  const before = text.slice(0, offset).split(/\r\n|\r|\n/)
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 }
}

// New keys follow the file's own indentation and line ends, as an editor would
function formattingOf(text: string): FormattingOptions {
  const indent = /^([ \t]+)\S/m.exec(text)?.[1]
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  if (indent?.startsWith('\t')) return { insertSpaces: false, tabSize: 1, eol }
  return { insertSpaces: true, tabSize: indent?.length ?? 2, eol }
}

// jsonc-parser's SyntaxKind is a const enum, which isolated modules cannot read: its values, by name
const TOKEN = { comma: 5, lineComment: 12, blockComment: 13, lineBreak: 14, blank: 15 } as const
const SKIPPED: readonly number[] = [TOKEN.blank, TOKEN.lineComment, TOKEN.blockComment]

// Where the line of the group's last value ends, past its comma and the comments beside it; undefined
// when something else follows on that line, such as the brace of a group written on one line
function lineEndAfter(text: string, offset: number): { end: number; comma: boolean } | undefined {
  const scanner = createScanner(text, false)
  scanner.setPosition(offset)
  let comma = false
  for (;;) {
    const token: number = scanner.scan()
    if (token === TOKEN.lineBreak) return { end: scanner.getTokenOffset(), comma }
    if (token === TOKEN.comma && !comma) comma = true
    else if (!SKIPPED.includes(token)) return undefined
  }
}

interface Placed {
  readonly text: string
  // What the edit wrote, the only part that gets formatted
  readonly start: number
  readonly end: number
}

// jsonc-parser appends a key right after the last value, which would carry the comment beside that value
// down to the new key; here the new key goes on its own line below, and a trailing comma stays one
function place(text: string, change: Edit, eol: string): Placed {
  const line =
    change.length === 0 && change.content.startsWith(',')
      ? lineEndAfter(text, change.offset)
      : undefined
  if (line) {
    const separator = line.comma ? '' : ','
    const inserted = `${eol}${change.content.slice(1)}${line.comma ? ',' : ''}`
    const start = line.end + separator.length
    return {
      text: `${text.slice(0, change.offset)}${separator}${text.slice(change.offset, line.end)}${inserted}${text.slice(line.end)}`,
      start,
      end: start + inserted.length,
    }
  }
  const next = applyEdits(text, [change])
  const start = change.offset
  const end = change.offset + change.content.length
  let before = start
  let after = end
  while (before > 0 && /\s/.test(next[before - 1] ?? '')) before -= 1
  while (after < next.length && /\s/.test(next[after] ?? '')) after += 1
  // A group that was empty gets its braces formatted too, or it would read `{"key": 1}`
  if (next[before - 1] === '{' || next[before - 1] === '[')
    return { text: next, start: before - 1, end: after + 1 }
  return { text: next, start, end }
}

// Formats only what the edit wrote, so every line the user wrote keeps its layout; jsonc-parser's own
// formatting would redo the lines around the edit
function applyEdit(text: string, edit: SettingsEdit, options: FormattingOptions): string {
  const [change] = modify(text, [...edit.path], edit.value, {})
  if (!change) return text
  const placed = place(text, change, options.eol ?? '\n')
  const range = { offset: placed.start, length: placed.end - placed.start }
  return applyEdits(placed.text, format(placed.text, range, options))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function createJsoncSettingsText(): SettingsText {
  return {
    read(source): SettingsTextRead {
      const text = source.startsWith(BOM) ? source.slice(1) : source
      if (stripComments(text).trim() === '') return { kind: 'ok', value: {} }
      const errors: ParseError[] = []
      const root = parseTree(text, errors, { allowTrailingComma: true })
      const [error] = errors
      if (error) return { kind: 'invalid', at: positionOf(text, error.offset) }
      const value: unknown = root ? getNodeValue(root) : undefined
      if (!root || !isRecord(value))
        return { kind: 'invalid', at: positionOf(text, root?.offset ?? 0) }
      return { kind: 'ok', value }
    },
    edit(source, edits: readonly SettingsEdit[]) {
      const bom = source.startsWith(BOM) ? BOM : ''
      const formattingOptions = formattingOf(source)
      let text = source.slice(bom.length)
      for (const edit of edits) text = applyEdit(text, edit, formattingOptions)
      return `${bom}${text}`
    },
  }
}
