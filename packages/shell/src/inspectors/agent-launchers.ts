import { posix, win32 } from 'node:path'
import { type AgentProfile, launchCommand } from '@dck/core'

export interface LauncherStats {
  readonly mode: number
  isFile(): boolean
}

export interface AgentLaunchersDeps {
  readonly agents: readonly AgentProfile[]
  // The PATH a command typed in a tab is looked up in
  path(): Promise<string | undefined>
  readonly platform: NodeJS.Platform
  // Follows links, like `fs.promises.stat`; rejects when the path does not exist
  stat(path: string): Promise<LauncherStats>
  // Windows' PATHEXT: the extensions that make a file a command there
  readonly pathext?: string
}

const EXECUTE_BITS = 0o111
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

// Which agents can start in a tab: their `launch` command is an executable file in one of the PATH's
// folders, found the way a shell would find it, without running a shell or `which`
export function createAgentLaunchers(deps: AgentLaunchersDeps) {
  const windows = deps.platform === 'win32'
  const paths = windows ? win32 : posix
  const suffixes = windows
    ? ['', ...(deps.pathext ?? DEFAULT_PATHEXT).split(';').filter((suffix) => suffix !== '')]
    : ['']

  // Windows has no execute bit; its extension list already decides what runs
  const isCommand = (path: string) =>
    deps.stat(path).then(
      (stats) => stats.isFile() && (windows || (stats.mode & EXECUTE_BITS) !== 0),
      () => false,
    )

  // A relative PATH entry (an empty one is the current folder) would depend on where the shell stands
  function candidates(command: string, folders: readonly string[]): string[] {
    if (command.includes('/') || (windows && command.includes('\\')))
      return paths.isAbsolute(command) ? suffixes.map((suffix) => command + suffix) : []
    return folders
      .filter((folder) => paths.isAbsolute(folder))
      .flatMap((folder) => suffixes.map((suffix) => paths.join(folder, command + suffix)))
  }

  async function found(command: string, folders: readonly string[]): Promise<boolean> {
    for (const candidate of candidates(command, folders))
      if (await isCommand(candidate)) return true
    return false
  }

  return {
    async launchable(): Promise<readonly AgentProfile[]> {
      const folders = ((await deps.path()) ?? '').split(paths.delimiter)
      const answers = await Promise.all(
        deps.agents.map((agent) =>
          agent.launch ? found(launchCommand(agent.launch), folders) : false,
        ),
      )
      return deps.agents.filter((_agent, index) => answers[index])
    },
  }
}

export type AgentLaunchers = ReturnType<typeof createAgentLaunchers>
