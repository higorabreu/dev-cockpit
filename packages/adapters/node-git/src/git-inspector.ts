import { execFile } from 'node:child_process'
import { type GitInspector, type GitStatus, parseGitStatus } from '@dck/core'

const TIMEOUT_MS = 3000

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

// Falha do git (fora de repositório, sem git instalado, tempo esgotado) significa sem informação
export function createGitInspector(): GitInspector {
  return {
    async status(cwd): Promise<GitStatus | undefined> {
      const [root, status] = await Promise.all([
        git(cwd, ['rev-parse', '--show-toplevel']),
        git(cwd, ['status', '--porcelain=v2', '--branch']),
      ])
      if (root === undefined || status === undefined) return undefined
      return { root: root.trim(), ...parseGitStatus(status) }
    },
  }
}
