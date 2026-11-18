import { type DiffFile, type DiffLine, isGeneratedPath } from '@dck/core'

// Git calls a file binary when a NUL byte sits among its first 8000 bytes
const BINARY_PROBE = 8000
const CARRIAGE_RETURN = 0x0d
// What the parser of git's output finds in text that is not UTF-8 once decoded
const REPLACEMENT = '�'

// The attributes that change what `git diff` compares for a file in the working tree or how it shows it
export const UNTRACKED_ATTRIBUTES = [
  'diff',
  'text',
  'eol',
  'crlf',
  'filter',
  'ident',
  'working-tree-encoding',
] as const

// How git's diff takes a file: `-diff` (or `binary`) forces binary, `diff` forces text, else it looks
export type TextMode = 'auto' | 'binary' | 'text'

// How to read one untracked file the way `git diff --no-index` would
export interface UntrackedPlan {
  readonly text: TextMode
  // A diff driver, a clean filter, `ident` or a working tree encoding: only git knows the result
  readonly git: boolean
  // Git may turn its CRLF into LF before comparing, so a file holding a carriage return goes to git
  readonly lineEnds: boolean
  // `core.bigFileThreshold`: a regular file past it is binary for git unless an attribute says otherwise
  readonly bigFile: number | undefined
}

const UNITS: Readonly<Record<string, number>> = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }

// The settings of `git config --get-regexp '^core\.(autocrlf|bigfilethreshold)$'`, the last one winning
function readSettings(config: string) {
  let autocrlf = false
  let bigFile: number | undefined
  for (const line of config.split('\n')) {
    const [key = '', ...rest] = line.split(' ')
    // A key with no value is a boolean set to true
    const value = rest.length === 0 ? 'true' : rest.join(' ').trim().toLowerCase()
    if (key === 'core.autocrlf') autocrlf = !['false', 'no', 'off', '0', ''].includes(value)
    if (key === 'core.bigfilethreshold') {
      const match = /^(\d+)([kmg]?)$/.exec(value)
      bigFile = match ? Number(match[1]) * (UNITS[match[2] ?? ''] ?? 1) : undefined
    }
  }
  return { autocrlf, bigFile }
}

// The plan of each path from `git check-attr -z` over UNTRACKED_ATTRIBUTES and the settings; without the
// attributes every file goes to git
export function untrackedPlans(
  attributes: string | undefined,
  config: string,
): (path: string) => UntrackedPlan {
  const { autocrlf, bigFile } = readSettings(config)
  const values = new Map<string, Map<string, string>>()
  const fields = (attributes ?? '').split('\0')
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const path = fields[index] ?? ''
    const known = values.get(path) ?? new Map<string, string>()
    known.set(fields[index + 1] ?? '', fields[index + 2] ?? '')
    values.set(path, known)
  }
  return (path) => {
    const known = values.get(path)
    if (attributes === undefined || known === undefined)
      return { text: 'auto', git: true, lineEnds: false, bigFile }
    const value = (name: string) => known.get(name) ?? 'unspecified'
    const given = (name: string) => !['unspecified', 'unset'].includes(value(name))
    const diff = value('diff')
    const converts = value('text') !== 'unset' && value('crlf') !== 'unset'
    return {
      text: diff === 'set' ? 'text' : diff === 'unset' ? 'binary' : 'auto',
      git:
        (given('diff') && diff !== 'set') ||
        ['filter', 'ident', 'working-tree-encoding'].some(given),
      lineEnds:
        converts &&
        (autocrlf || ['text', 'eol', 'crlf'].some((name) => value(name) !== 'unspecified')),
      bigFile,
    }
  }
}

// Whether the plan leaves this content to git
export const needsGit = (plan: UntrackedPlan, content: Buffer) =>
  plan.git || (plan.lineEnds && content.includes(CARRIAGE_RETURN))

// An untracked file as git's diff against /dev/null shows it, parsed: one hunk of added lines, or a binary
export function addedFile(
  path: string,
  content: Buffer,
  plan: Pick<UntrackedPlan, 'text' | 'bigFile'>,
  link: boolean,
): DiffFile {
  const big = !link && plan.bigFile !== undefined && content.length > plan.bigFile
  const binary =
    plan.text === 'binary' ||
    (plan.text === 'auto' && (big || content.subarray(0, BINARY_PROBE).includes(0)))
  const file: DiffFile = {
    path,
    oldPath: undefined,
    status: 'added',
    oldMode: undefined,
    newMode: undefined,
    binary,
    nonUtf8: false,
    submodule: false,
    crlf: false,
    generated: isGeneratedPath(path),
    untracked: true,
    additions: 0,
    deletions: 0,
    hunks: [],
  }
  if (binary || content.length === 0) return file
  const text = content.toString('utf8')
  const rows = text.split('\n')
  if (text.endsWith('\n')) rows.pop()
  let crlf = false
  let nonUtf8 = false
  const lines = rows.map((row, index): DiffLine => {
    const ending = row.endsWith('\r')
    const line = ending ? row.slice(0, -1) : row
    crlf ||= ending
    nonUtf8 ||= line.includes(REPLACEMENT)
    return { kind: 'add', text: line, old: undefined, new: index + 1 }
  })
  const last = lines.at(-1)
  if (last && !text.endsWith('\n')) lines[lines.length - 1] = { ...last, noNewline: true }
  const hunk = { oldStart: 0, oldCount: 0, newStart: 1, newCount: lines.length, section: '', lines }
  return {
    ...file,
    binary: nonUtf8,
    nonUtf8,
    crlf,
    additions: lines.length,
    // Text that is not UTF-8 is not drawn, so its lines are not carried around
    hunks: nonUtf8 ? [] : [hunk],
  }
}
