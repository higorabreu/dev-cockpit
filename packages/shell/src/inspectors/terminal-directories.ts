import { createDirectoryReader } from '@dck/core'

// The directory of each terminal's shell, by pid, for systems that cannot read it from the process: the
// folder it started in, then each folder its prompt reports (OSC 7)
export function createTerminalDirectories(platform: 'win32' | 'posix') {
  const terminals = new Map<
    number,
    { cwd: string; reader: ReturnType<typeof createDirectoryReader> }
  >()
  return {
    started(pid: number, cwd: string) {
      terminals.set(pid, { cwd, reader: createDirectoryReader(platform) })
    },
    output(pid: number, data: string) {
      const terminal = terminals.get(pid)
      const reported = terminal?.reader.feed(data)
      if (terminal && reported !== undefined) terminal.cwd = reported
    },
    ended(pid: number) {
      terminals.delete(pid)
    },
    get: (pid: number) => terminals.get(pid)?.cwd,
  }
}

export type TerminalDirectories = ReturnType<typeof createTerminalDirectories>
