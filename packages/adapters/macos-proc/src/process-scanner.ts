import type { ProcessScanner } from '@dck/core'
import { type CommandRunner, runCommand } from './command-runner.ts'

const parseListing = (output: string | undefined) =>
  (output ?? '').split('\n').flatMap((line) => {
    const match = /^\s*(\d+) (.*)$/.exec(line)
    return match ? [{ pid: Number(match[1]), command: match[2] ?? '' }] : []
  })

// The command is one string, so the script must stand as a whole argument between spaces
const hasArgument = (command: string, argument: string) => ` ${command} `.includes(` ${argument} `)

const ENDPOINT_MARKER = ' DCK_ENDPOINT='

// `ps -E` appends the environment after the command with nothing escaped, so a value may hold spaces;
// the last marker wins, so an argument cannot pose as the variable, and the value runs up to the next
// variable or the end
const onEndpoint = (environment: string, endpoint: string | undefined) => {
  const padded = ` ${environment}`
  const at = padded.lastIndexOf(ENDPOINT_MARKER)
  if (at < 0) return endpoint === undefined
  const value = padded.slice(at + ENDPOINT_MARKER.length)
  return endpoint !== undefined && (value === endpoint || value.startsWith(`${endpoint} `))
}

export function createProcessScanner(run: CommandRunner = runCommand): ProcessScanner {
  return {
    async find(query) {
      // Without `-a`, `ps` lists only the user's own processes, the only ones whose environment it shows
      const listing = await run('ps', ['-xww', '-o', 'pid=,command='])
      const candidates = parseListing(listing).filter(
        ({ pid, command }) => pid !== query.exclude && hasArgument(command, query.argument),
      )
      const found: number[] = []
      for (const { pid, command } of candidates) {
        const output = await run('ps', ['-E', '-ww', '-o', 'command=', '-p', String(pid)])
        // Gone, or the pid now runs something else
        if (!output?.startsWith(command)) continue
        if (onEndpoint(output.slice(command.length).trimEnd(), query.endpoint)) found.push(pid)
      }
      return found
    },
  }
}
