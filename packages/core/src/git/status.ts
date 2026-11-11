import type { GitCommit, GitFile, GitFileStatus } from '../ports/session.ts'

export interface ParsedGitStatus {
  readonly branch: string | undefined
  readonly upstream: string | undefined
  readonly ahead: number
  readonly behind: number
  readonly staged: readonly GitFile[]
  readonly changes: readonly GitFile[]
}

const LETTERS: Record<string, GitFileStatus> = {
  M: 'M',
  T: 'M',
  A: 'A',
  D: 'D',
  R: 'R',
  C: 'A',
}

const letter = (code: string | undefined): GitFileStatus | undefined =>
  code === undefined ? undefined : LETTERS[code]

const byPath = (a: GitFile, b: GitFile) => a.path.localeCompare(b.path)

// Lê `git status --porcelain=v2 -z --branch`; com -z os caminhos vêm sem aspas e os registros
// terminam em NUL, e o caminho de origem de um renomeado vem como registro seguinte
export function parseGitStatus(output: string): ParsedGitStatus {
  const records = output.split('\0')
  let branch: string | undefined
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  const staged: GitFile[] = []
  const changes: GitFile[] = []

  for (let index = 0; index < records.length; index++) {
    const record = records[index] ?? ''
    if (record.startsWith('# branch.head ')) {
      const head = record.slice('# branch.head '.length)
      branch = head === '(detached)' ? undefined : head
    } else if (record.startsWith('# branch.upstream ')) {
      upstream = record.slice('# branch.upstream '.length)
    } else if (record.startsWith('# branch.ab ')) {
      const match = /\+(\d+) -(\d+)/.exec(record)
      ahead = Number(match?.[1] ?? 0)
      behind = Number(match?.[2] ?? 0)
    } else if (record.startsWith('? ')) {
      changes.push({ status: 'U', path: record.slice(2) })
    } else if (record.startsWith('u ')) {
      changes.push({ status: '!', path: record.split(' ').slice(10).join(' ') })
    } else if (record.startsWith('1 ') || record.startsWith('2 ')) {
      const parts = record.split(' ')
      const renamed = record.startsWith('2 ')
      const path = parts.slice(renamed ? 9 : 8).join(' ')
      if (renamed) index += 1
      // Submódulos aparecem na própria seção, com o estado interno de cada um
      if ((parts[2] ?? '').startsWith('S')) continue
      const xy = parts[1] ?? '..'
      const x = letter(xy[0])
      const y = letter(xy[1])
      if (x) staged.push({ status: x, path })
      if (y) changes.push({ status: y, path })
    }
  }
  return {
    branch,
    upstream,
    ahead,
    behind,
    staged: staged.sort(byPath),
    changes: changes.sort(byPath),
  }
}

export const countDistinctFiles = (staged: readonly GitFile[], changes: readonly GitFile[]) =>
  new Set([...staged, ...changes].map((file) => file.path)).size

const FIELD = '\u001f'
const RECORD = '\u001e'

// Formato esperado: `--format=%h%x1f%s%x1f%ct%x1e`
export function parseGitLog(output: string): readonly GitCommit[] {
  return output
    .split(RECORD)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      const [hash, subject, time] = entry.split(FIELD)
      return hash && subject !== undefined && time ? [{ hash, subject, time: Number(time) }] : []
    })
}

export interface SubmoduleListing {
  readonly path: string
  readonly initialized: boolean
}

// Lê `git submodule status`: o primeiro caractere é espaço, +, - ou U, depois o hash e o caminho
export function parseSubmoduleList(output: string): readonly SubmoduleListing[] {
  return output
    .split('\n')
    .filter((line) => line.length > 41)
    .flatMap((line) => {
      const path = line.slice(41).trim().split(' (')[0]
      return path ? [{ path, initialized: line[0] !== '-' }] : []
    })
}

const TICKET = /[A-Z][A-Z0-9]+-\d+/

// Chave de ticket no nome da branch, como NTF-400 em feature/NTF-400-api-publica
export function ticketFromBranch(branch: string | undefined): string | undefined {
  return branch ? TICKET.exec(branch)?.[0] : undefined
}

export type AgoUnit = 'now' | 'min' | 'h' | 'd'

const UNITS: ReadonlyArray<readonly [number, Exclude<AgoUnit, 'now'>]> = [
  [86400, 'd'],
  [3600, 'h'],
  [60, 'min'],
]

// Há quanto tempo, em partes, para quem exibe escolher a língua
export function agoParts(
  nowSeconds: number,
  thenSeconds: number,
): { unit: AgoUnit; value: number } {
  const elapsed = Math.max(0, nowSeconds - thenSeconds)
  for (const [size, unit] of UNITS) {
    if (elapsed >= size) return { unit, value: Math.floor(elapsed / size) }
  }
  return { unit: 'now', value: 0 }
}
