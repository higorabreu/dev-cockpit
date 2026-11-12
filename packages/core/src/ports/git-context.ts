export interface GitContext {
  // Undefined outside a repository or on a detached HEAD
  currentBranch(cwd: string): Promise<string | undefined>
}
