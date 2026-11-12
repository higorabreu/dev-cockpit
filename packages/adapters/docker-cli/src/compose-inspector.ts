import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { type ComposeInspector, type ComposeStatus, parseComposePs } from '@dck/core'

const COMPOSE_FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']
const TIMEOUT_MS = 6000
const MAX_LEVELS = 8
const CACHE_MS = 1500

export interface ComposeInspectorOptions {
  // Folder where the search stops, normally the user's home
  readonly stopAt?: string
  // Runs `docker compose ... ps`; undefined when the command fails
  readonly run?: (file: string) => Promise<string | undefined>
  readonly now?: () => number
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

// Walks up from the directory looking for the project's compose file
export async function findComposeFile(cwd: string, stopAt?: string): Promise<string | undefined> {
  let directory = cwd
  for (let level = 0; level < MAX_LEVELS; level++) {
    for (const name of COMPOSE_FILES) {
      const candidate = join(directory, name)
      if (await exists(candidate)) return candidate
    }
    const parent = dirname(directory)
    if (parent === directory || directory === stopAt) return undefined
    directory = parent
  }
  return undefined
}

const runDocker = (file: string) =>
  new Promise<string | undefined>((resolve) => {
    execFile(
      'docker',
      ['compose', '-f', file, 'ps', '--all', '--format', 'json'],
      { cwd: dirname(file), timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => resolve(error ? undefined : stdout),
    )
  })

export function createComposeInspector(options: ComposeInspectorOptions = {}): ComposeInspector {
  const run = options.run ?? runDocker
  const now = options.now ?? Date.now
  const cache = new Map<string, { at: number; value: ComposeStatus }>()

  return {
    async status(cwd): Promise<ComposeStatus> {
      const file = await findComposeFile(cwd, options.stopAt)
      if (!file) return { kind: 'none' }
      const cached = cache.get(file)
      if (cached && now() - cached.at < CACHE_MS) return cached.value
      const output = await run(file)
      const value: ComposeStatus =
        output === undefined
          ? { kind: 'unavailable' }
          : { kind: 'ok', project: basename(dirname(file)), containers: parseComposePs(output) }
      cache.set(file, { at: now(), value })
      return value
    },
  }
}
