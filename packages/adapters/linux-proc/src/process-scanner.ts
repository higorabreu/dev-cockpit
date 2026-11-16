import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProcessScanner } from '@dck/core'

export function createProcessScanner(procRoot = '/proc'): ProcessScanner {
  const text = (path: string) => readFile(path, 'utf8').catch(() => undefined)

  return {
    async find(query) {
      const names = await readdir(procRoot).catch(() => [] as string[])
      const found: number[] = []
      for (const name of names) {
        if (!/^\d+$/.test(name) || Number(name) === query.exclude) continue
        const cmdline = await text(join(procRoot, name, 'cmdline'))
        if (!cmdline?.split('\0').includes(query.argument)) continue
        const environ = (await text(join(procRoot, name, 'environ'))) ?? ''
        const value = environ
          .split('\0')
          .find((entry) => entry.startsWith('DCK_ENDPOINT='))
          ?.slice('DCK_ENDPOINT='.length)
        if (value === query.endpoint) found.push(Number(name))
      }
      return found
    },
  }
}
