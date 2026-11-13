import { Buffer } from 'node:buffer'
import { type ProcessInfo, type ProcessInspector, UNKNOWN_FOREGROUND } from '@dck/core'
import { type CommandRunner, runCommand } from './command-runner.ts'

// The window polls every tab at once, so close calls share one `lsof` and one `ps`
const BATCH_MS = 10
// A command stuck past its kill (a stale network mount) must not hold the sessions watcher
const DEADLINE_MS = 5000

// `lsof` writes a backslash as `\\`, controls as `\n` and the like and other bytes as `\xNN`, so a
// UTF-8 name comes back escaped in the C locale an app opened from Finder has; `^X` is left as is,
// since a literal caret is not escaped
const ESCAPES: Record<string, string> = { '\\': '5c', n: '0a', t: '09', r: '0d', b: '08', f: '0c' }

// Odd parts of the split are the escapes, each one byte in hex
const decodeLsofName = (text: string) =>
  Buffer.concat(
    text
      .split(/\\(x[0-9a-fA-F]{2}|[\\ntrbf])/)
      .map((part, index) =>
        index % 2 === 0
          ? Buffer.from(part)
          : Buffer.from(part.length === 3 ? part.slice(1) : (ESCAPES[part] ?? ''), 'hex'),
      ),
  ).toString('utf8')

// `lsof -F` prints a `p<pid>` line, then the fields of its descriptors; `n` is the cwd path
const parseCwds = (output: string | undefined) => {
  const cwds = new Map<number, string>()
  let pid = 0
  for (const line of output?.split('\n') ?? []) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('n')) cwds.set(pid, decodeLsofName(line.slice(1)))
  }
  return cwds
}

// ucomm is the bare executable name, like /proc/<pid>/comm on Linux, and may contain spaces
const parseTable = (output: string | undefined) => {
  const table = new Map<number, { group: number; name: string }>()
  for (const line of output?.split('\n') ?? []) {
    const match = /^\s*(\d+)\s+(\d+) (.*)$/.exec(line)
    if (match)
      table.set(Number(match[1]), { group: Number(match[2]), name: match[3]?.trim() ?? '' })
  }
  return table
}

// Resolves with undefined when the work outlives the deadline, and then reports it as overdue
const settle = <T>(work: Promise<T>, milliseconds: number, onOverdue: () => void) =>
  new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => {
      onOverdue()
      resolve(undefined)
    }, milliseconds)
    void work.then(resolve).finally(() => clearTimeout(timer))
  })

const outputOf = <T>(result: PromiseSettledResult<T>) =>
  result.status === 'fulfilled' ? result.value : undefined

export function createProcessInspector(
  run: CommandRunner = runCommand,
  batchMs = BATCH_MS,
  deadlineMs = DEADLINE_MS,
): ProcessInspector {
  let queue: { pid: number; resolve: (info: ProcessInfo | undefined) => void }[] = []
  // A command that survives its kill (an `lsof` stuck on a mount) would pile up a copy per poll
  let overdue = 0

  // A runner that throws at once still becomes a rejection, so no caller is left pending
  const start = (command: Parameters<CommandRunner>[0], args: readonly string[]) =>
    Promise.resolve().then(() => run(command, args))

  async function flush() {
    const batch = queue
    queue = []
    if (overdue > 0) {
      for (const { resolve } of batch) resolve(undefined)
      return
    }
    const pids = [...new Set(batch.map(({ pid }) => pid))]
    const work = Promise.allSettled([
      start('lsof', ['-b', '-w', '-a', '-d', 'cwd', '-Fn', '-p', pids.join(',')]),
      start('ps', ['-axo', 'pid=,tpgid=,ucomm=']),
    ])
    const outputs = await settle(work, deadlineMs, () => {
      overdue += 1
      void work.then(() => {
        overdue -= 1
      })
    })
    const [cwdOutput, tableOutput] = outputs?.map(outputOf) ?? []
    const cwds = parseCwds(cwdOutput)
    const table = parseTable(tableOutput)
    for (const { pid, resolve } of batch) {
      const cwd = cwds.get(pid)
      const group = table.get(pid)?.group || undefined
      const name = group === undefined ? undefined : table.get(group)?.name
      resolve(
        cwd === undefined
          ? undefined
          : {
              cwd,
              foreground: name || UNKNOWN_FOREGROUND,
              ...(group !== undefined ? { foregroundPid: group } : {}),
            },
      )
    }
  }

  return {
    inspect(pid) {
      return new Promise((resolve) => {
        if (queue.length === 0) setTimeout(() => void flush(), batchMs)
        queue.push({ pid, resolve })
      })
    },
  }
}
