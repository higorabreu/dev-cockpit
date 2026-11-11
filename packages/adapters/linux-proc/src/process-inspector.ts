import { readFile, readlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProcessInfo, ProcessInspector } from '@dck/core'

// Em /proc/<pid>/stat o nome do processo vem entre parênteses e pode conter espaços e ")";
// os campos úteis começam depois do último ")": estado, ppid, pgrp, sessão, tty e tpgid
export function parseForegroundGroup(stat: string): number | undefined {
  const rest = stat
    .slice(stat.lastIndexOf(')') + 1)
    .trim()
    .split(/\s+/)
  const tpgid = Number(rest[5])
  return Number.isInteger(tpgid) && tpgid > 0 ? tpgid : undefined
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
      return { cwd, foreground: name?.trim() || 'desconhecido' }
    },
  }
}
