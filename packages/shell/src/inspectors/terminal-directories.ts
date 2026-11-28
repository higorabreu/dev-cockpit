// The directory of each terminal's shell, by pid, for systems that cannot read it from the process
export function createTerminalDirectories() {
  const directories = new Map<number, string>()
  return {
    started(pid: number, cwd: string) {
      directories.set(pid, cwd)
    },
    ended(pid: number) {
      directories.delete(pid)
    },
    get: (pid: number) => directories.get(pid),
  }
}

export type TerminalDirectories = ReturnType<typeof createTerminalDirectories>
