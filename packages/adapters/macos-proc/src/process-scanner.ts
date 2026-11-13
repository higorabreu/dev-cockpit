import type { ProcessScanner } from '@dck/core'
import { type CommandRunner, runCommand } from './command-runner.ts'

const parseListing = (output: string | undefined) =>
  (output ?? '').split('\n').flatMap((line) => {
    const match = /^\s*(\d+) (.*)$/.exec(line)
    return match ? [{ pid: Number(match[1]), command: match[2] ?? '' }] : []
  })

// `ps eww` appends the environment to the command; it only shows it for the user's own processes
const parseEndpoint = (output: string | undefined) =>
  /(?:^|\s)DCK_ENDPOINT=(\S+)/.exec(output ?? '')?.[1]

export function createProcessScanner(run: CommandRunner = runCommand): ProcessScanner {
  return {
    async find(query) {
      const listing = await run('ps', ['-axo', 'pid=,command='])
      // The command is one string here, so a path with spaces is matched as a substring
      const candidates = parseListing(listing).filter(
        ({ pid, command }) => pid !== query.exclude && command.includes(query.argument),
      )
      const found: number[] = []
      for (const { pid } of candidates) {
        const environment = await run('ps', ['eww', '-o', 'command=', '-p', String(pid)])
        if (parseEndpoint(environment) === query.endpoint) found.push(pid)
      }
      return found
    },
  }
}
