import { describeError, type ErrorBody, errorCodeOf, type Translate } from '@dck/core'

// What every command module receives to print with
export interface Io {
  out(text: string): void
  err(text: string): void
  readonly t: Translate
}

// Exit codes from sysexits.h, the BSD convention for command-line tools
export const EXIT = { ok: 0, failed: 1, usage: 64, unavailable: 69, software: 70 } as const

// A manifest, a folder name and a standard are third-party text: a control character could clear the screen or forge a row
export const printable = (text: string) =>
  [...text].map((char) => (char < ' ' || char === '\u007f' ? '?' : char)).join('')

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
