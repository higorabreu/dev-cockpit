import { readFile, readlink } from 'node:fs/promises'
import { join } from 'node:path'
import { type ProcessInfo, type ProcessInspector, UNKNOWN_FOREGROUND } from '@dck/core'

// In /proc/<pid>/stat the process name comes in parentheses and may contain spaces and ")";
// the useful fields start after the last ")": state, ppid, pgrp, session, tty and tpgid
export function parseForegroundGroup(stat: string): number | undefined {
  const rest = stat
    .slice(stat.lastIndexOf(')') + 1)
    .trim()
    .split(/\s+/)
  const tpgid = Number(rest[5])
  return Number.isInteger(tpgid) && tpgid > 0 ? tpgid : undefined
}

// Field 22 of /proc/<pid>/stat, the process start in ticks since boot
export function parseStartTime(stat: string): string | undefined {
  const rest = stat
    .slice(stat.lastIndexOf(')') + 1)
    .trim()
    .split(/\s+/)
  return rest[19] && /^\d+$/.test(rest[19]) ? rest[19] : undefined
}

export function createProcessInspector(procRoot = '/proc'): ProcessInspector {
  const text = (path: string) => readFile(path, 'utf8').catch(() => undefined)

  return {
    async inspect(pid): Promise<ProcessInfo | undefined> {
      const cwd = await readlink(join(procRoot, String(pid), 'cwd')).catch(() => undefined)
      if (cwd === undefined) return undefined
      const stat = await text(join(procRoot, String(pid), 'stat'))
      const group = stat === undefined ? undefined : parseForegroundGroup(stat)
      const name =
        group === undefined ? undefined : await text(join(procRoot, String(group), 'comm'))
      const groupStat =
        group === undefined ? undefined : await text(join(procRoot, String(group), 'stat'))
      const start = groupStat === undefined ? undefined : parseStartTime(groupStat)
      return {
        cwd,
        foreground: name?.trim() || UNKNOWN_FOREGROUND,
        ...(group !== undefined ? { foregroundPid: group } : {}),
        ...(start !== undefined ? { foregroundStart: start } : {}),
      }
    },
  }
}
