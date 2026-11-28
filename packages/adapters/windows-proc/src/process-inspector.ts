import { type ProcessInfo, type ProcessInspector, UNKNOWN_FOREGROUND } from '@dck/core'
import { createNativeTable } from './native-table.ts'
import type { ProcessEntry, ProcessTable } from './process-table.ts'

// The window polls every tab at once, so close calls share one process list
const BATCH_MS = 10
// A tree deeper than this is a loop of reused pids, not a real chain of launchers
const MAX_DEPTH = 8

// Attached to every console program; never what the user runs
const CONSOLE_HOSTS = new Set(['conhost', 'openconsole'])
// Git's bin\bash.exe starts usr\bin\bash.exe, and an npm `.cmd` shim runs its program under cmd: the
// program is one level down
const LAUNCHERS = new Set(['bash', 'cmd'])
// Entry files too generic to name a program; the package folder names it instead
const GENERIC_SCRIPTS = new Set(['cli', 'index', 'main'])

export const programName = (file: string) => file.replace(/\.exe$/i, '').toLowerCase()

const tokens = (commandLine: string) =>
  [...commandLine.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? '')

// A program installed through npm runs as node.exe; its script says which one it is
export function nodeScriptName(commandLine: string): string | undefined {
  const script = tokens(commandLine)
    .slice(1)
    .find((token) => /\.[cm]?js$/i.test(token))
  if (script === undefined) return undefined
  const parts = script.split(/[\\/]/)
  const name = (parts.at(-1) ?? '').replace(/\.[cm]?js$/i, '').toLowerCase()
  if (!GENERIC_SCRIPTS.has(name)) return name
  const modules = parts.lastIndexOf('node_modules')
  const scoped = parts[modules + 1]?.startsWith('@') === true
  return modules < 0 ? name : (parts[modules + (scoped ? 2 : 1)]?.toLowerCase() ?? name)
}

interface Foreground {
  readonly entry: ProcessEntry
  readonly created: bigint | undefined
}

// The newest child that started after its parent: an older one holds a pid the parent once had
async function newestChild(
  table: ProcessTable,
  entries: readonly ProcessEntry[],
  parent: Foreground,
): Promise<Foreground | undefined> {
  const children = entries.filter(
    (entry) => entry.parent === parent.entry.pid && !CONSOLE_HOSTS.has(programName(entry.name)),
  )
  const timed = await Promise.all(
    children.map(async (entry) => ({ entry, created: await table.createdAt(entry.pid) })),
  )
  let newest: Foreground | undefined
  for (const child of timed) {
    if (child.created === undefined) continue
    if (parent.created !== undefined && child.created < parent.created) continue
    if (newest?.created === undefined || child.created > newest.created) newest = child
  }
  return newest
}

// The shell itself at the prompt, else what it runs, through Git's and npm's launchers
async function foregroundOf(
  table: ProcessTable,
  entries: readonly ProcessEntry[],
  shell: ProcessEntry,
): Promise<Foreground> {
  let current: Foreground = { entry: shell, created: await table.createdAt(shell.pid) }
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const child = await newestChild(table, entries, current)
    if (!child) break
    current = child
    if (!LAUNCHERS.has(programName(child.entry.name))) break
  }
  return current
}

async function nameOf(table: ProcessTable, entry: ProcessEntry) {
  const name = programName(entry.name)
  if (name !== 'node') return name
  const commandLine = await table.commandLine(entry.pid)
  return (commandLine && nodeScriptName(commandLine)) || name
}

export interface WindowsProcessDeps {
  // Windows keeps no readable directory for another process (PowerShell never changes its own): the
  // terminal's directory comes from what the shell reports
  readonly cwdOf: (pid: number) => string | undefined
  readonly table?: ProcessTable
  readonly batchMs?: number
}

export function createProcessInspector({
  cwdOf,
  table = createNativeTable(),
  batchMs = BATCH_MS,
}: WindowsProcessDeps): ProcessInspector {
  let shared: Promise<readonly ProcessEntry[]> | undefined
  const list = () => {
    shared ??= table.list().finally(() => {
      setTimeout(() => {
        shared = undefined
      }, batchMs)
    })
    return shared
  }

  async function inspect(pid: number): Promise<ProcessInfo | undefined> {
    const cwd = cwdOf(pid)
    if (cwd === undefined) return undefined
    const entries = await list()
    const shell = entries.find((entry) => entry.pid === pid)
    if (!shell) return undefined
    const { entry, created } = await foregroundOf(table, entries, shell)
    return {
      cwd,
      foreground: (await nameOf(table, entry)) || UNKNOWN_FOREGROUND,
      foregroundPid: entry.pid,
      ...(created !== undefined ? { foregroundStart: String(created) } : {}),
    }
  }

  return {
    // A failed native load or a vanished process leaves the tab without process details, as on the
    // other systems
    inspect: (pid) => inspect(pid).catch(() => undefined),
  }
}
