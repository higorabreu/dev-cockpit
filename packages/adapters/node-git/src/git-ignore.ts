import { basename, dirname } from 'node:path'
import type { GitIgnoreCheck } from '@dck/core'
import { type GitRun, runGit } from './git-run.ts'

const OPTIONS = { timeoutMs: 2000, maxBytes: 4096 } as const

// `git check-ignore` from the file's folder: exit 0 is ignored, 1 is not, 128 is no repository
export function createGitIgnoreCheck(run: GitRun = runGit): GitIgnoreCheck {
  return {
    async isIgnored(path) {
      const answer = await run(dirname(path), ['check-ignore', '-q', '--', basename(path)], OPTIONS)
      return answer.ok && answer.code === 0
    },
  }
}
