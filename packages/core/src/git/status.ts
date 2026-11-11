import type { GitStatus } from '../ports/session.ts'

type ParsedStatus = Omit<GitStatus, 'root'>

const CHANGE_LINE = /^(1|2|u|\?) /

// Lê a saída de `git status --porcelain=v2 --branch`
export function parseGitStatus(output: string): ParsedStatus {
  let branch: string | undefined
  let ahead = 0
  let behind = 0
  let changed = 0
  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      branch = head === '(detached)' ? undefined : head
    } else if (line.startsWith('# branch.ab ')) {
      const match = /\+(\d+) -(\d+)/.exec(line)
      ahead = Number(match?.[1] ?? 0)
      behind = Number(match?.[2] ?? 0)
    } else if (CHANGE_LINE.test(line)) {
      changed += 1
    }
  }
  return { branch, changed, ahead, behind }
}
