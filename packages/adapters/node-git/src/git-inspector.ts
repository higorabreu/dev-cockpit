import { execFile } from 'node:child_process'
import { join } from 'node:path'
import {
  countDistinctFiles,
  type GitCommit,
  type GitInspector,
  type GitStatus,
  type GitSubmodule,
  parseGitLog,
  parseGitStatus,
  parseSubmoduleList,
} from '@dck/core'

const TIMEOUT_MS = 3000
const LOG_LIMIT = '20'
const DEFAULT_SUBMODULE_TTL_MS = 8000

export interface GitInspectorOptions {
  readonly submoduleTtlMs?: number
  readonly now?: () => number
}

function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    // Sem bloqueio opcional: a leitura periódica não pode disputar o índice com o git do usuário
    execFile(
      'git',
      ['--no-optional-locks', '-C', cwd, ...args],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => resolve(error ? undefined : stdout),
    )
  })
}

const STATUS_ARGS = ['status', '--porcelain=v2', '-z', '--branch'] as const

async function commits(cwd: string, range: string): Promise<readonly GitCommit[]> {
  const output = await git(cwd, ['log', range, '-n', LOG_LIMIT, '--format=%h%x1f%s%x1f%ct%x1e'])
  return output === undefined ? [] : parseGitLog(output)
}

interface OwnStatus {
  readonly changed: number
  readonly ahead: number
  readonly behind: number
}

// Falha do git (fora de repositório, sem git instalado, tempo esgotado) significa sem informação
export function createGitInspector(options: GitInspectorOptions = {}): GitInspector {
  const ttl = options.submoduleTtlMs ?? DEFAULT_SUBMODULE_TTL_MS
  const now = options.now ?? Date.now
  // Ler o estado de cada submódulo a cada ciclo seria caro; vale por alguns segundos
  const cache = new Map<string, { at: number; value: OwnStatus | undefined }>()

  async function ownStatus(directory: string): Promise<OwnStatus | undefined> {
    const cached = cache.get(directory)
    if (cached && now() - cached.at < ttl) return cached.value
    const output = await git(directory, STATUS_ARGS)
    const parsed = output === undefined ? undefined : parseGitStatus(output)
    const value = parsed && {
      changed: countDistinctFiles(parsed.staged, parsed.changes),
      ahead: parsed.ahead,
      behind: parsed.behind,
    }
    cache.set(directory, { at: now(), value })
    return value
  }

  return {
    async status(cwd): Promise<GitStatus | undefined> {
      const [root, output] = await Promise.all([
        git(cwd, ['rev-parse', '--show-toplevel']),
        git(cwd, STATUS_ARGS),
      ])
      if (root === undefined || output === undefined) return undefined
      const top = root.trim()
      const parsed = parseGitStatus(output)
      const { upstream } = parsed

      const [outgoing, incoming, listing] = await Promise.all([
        upstream && parsed.ahead > 0 ? commits(top, `${upstream}..HEAD`) : [],
        upstream && parsed.behind > 0 ? commits(top, `HEAD..${upstream}`) : [],
        git(top, ['submodule', 'status']),
      ])

      const pointers = new Map(parsed.submodules.map((entry) => [entry.path, entry.pointerChanged]))
      const initialized = parseSubmoduleList(listing ?? '').filter((entry) => entry.initialized)
      const inspected = await Promise.all(
        initialized.map(async (entry): Promise<GitSubmodule> => {
          const own = await ownStatus(join(top, entry.path))
          return {
            path: entry.path,
            pointerChanged: pointers.get(entry.path) ?? false,
            changed: own?.changed ?? 0,
            ahead: own?.ahead ?? 0,
            behind: own?.behind ?? 0,
          }
        }),
      )
      const pending = inspected.filter(
        (module) =>
          module.pointerChanged || module.changed > 0 || module.ahead > 0 || module.behind > 0,
      )

      return {
        root: top,
        branch: parsed.branch,
        upstream,
        changed: countDistinctFiles(parsed.staged, parsed.changes),
        staged: parsed.staged,
        changes: parsed.changes,
        ahead: parsed.ahead,
        behind: parsed.behind,
        outgoing,
        incoming,
        submodules: pending,
        submodulesClean: inspected.length - pending.length,
      }
    },
  }
}
