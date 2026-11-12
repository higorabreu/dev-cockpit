import type { GitContext } from '@dck/core'
import { git } from './git.ts'

export function createGitContext(): GitContext {
  return {
    async currentBranch(cwd) {
      // Fails on a detached HEAD, and names the branch of a repository that has no commit yet
      const output = await git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
      return output?.trim() || undefined
    },
  }
}
