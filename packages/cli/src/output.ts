import { describeError, type ErrorBody, errorCodeOf, type Translate } from '@dck/core'

// What every command module receives to print with
export interface Io {
  out(text: string): void
  err(text: string): void
  readonly t: Translate
}

// Exit codes from sysexits.h, the BSD convention for command-line tools
export const EXIT = { ok: 0, failed: 1, usage: 64, unavailable: 69, software: 70 } as const

// A manifest, a path and a standard are third-party text: a control or bidi character could clear the screen, forge a row or reorder it
const isUnsafe = (char: string) => /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(char)

const replaceUnsafe = (text: string, kept: string) =>
  [...text].map((char) => (isUnsafe(char) && !kept.includes(char) ? '?' : char)).join('')

export const printable = (text: string) => replaceUnsafe(text, '')

// For a text of several lines, such as a guide, which keeps its line breaks and tabs
export const printableText = (text: string) => replaceUnsafe(text, '\n\t')

// Pads every column but the last to its widest cell, so the rows line up without a frame
export function align(table: readonly (readonly string[])[]): string[] {
  const rows = table.map((row) => row.map(printable))
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

// An ErrorBody carries the English message and the detail as one text; a listing translates the message
function detailOf(error: ErrorBody): string {
  const prefix = `${describeError(errorCodeOf(error))}: `
  return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : ''
}

export function rejection(error: ErrorBody, t: Translate): string {
  const message = t(`error.${errorCodeOf(error)}`)
  const detail = detailOf(error)
  return detail === '' ? message : `${message}: ${detail}`
}

// A file that could not be written is an internal error; an unknown id or a refused value is a failure
export function refused(io: Io, error: ErrorBody): number {
  io.err(`${printable(rejection(error, io.t))}\n`)
  return errorCodeOf(error) === 'DCK-STD-002' ? EXIT.software : EXIT.failed
}
