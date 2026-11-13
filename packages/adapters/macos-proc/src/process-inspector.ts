import { type ProcessInfo, type ProcessInspector, UNKNOWN_FOREGROUND } from '@dck/core'
import { type CommandRunner, runCommand } from './command-runner.ts'

// The window polls every tab at once, so close calls share one `lsof` and one `ps`
const BATCH_MS = 10

// `lsof -F` prints a `p<pid>` line, then the fields of its descriptors; `n` is the cwd path
const parseCwds = (output: string | undefined) => {
  const cwds = new Map<number, string>()
  let pid = 0
  for (const line of output?.split('\n') ?? []) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('n')) cwds.set(pid, line.slice(1))
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

export function createProcessInspector(
  run: CommandRunner = runCommand,
  batchMs = BATCH_MS,
): ProcessInspector {
  let queue: { pid: number; resolve: (info: ProcessInfo | undefined) => void }[] = []

  async function flush() {
    const batch = queue
    queue = []
    const pids = [...new Set(batch.map(({ pid }) => pid))]
    const [cwdOutput, tableOutput] = await Promise.all([
      run('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', pids.join(',')]),
      run('ps', ['-axo', 'pid=,tpgid=,ucomm=']),
    ])
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
