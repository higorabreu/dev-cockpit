import { execFile } from 'node:child_process'
import { createReleaseDownload } from '@dck/adapter-node-fetch'
import { errorBody, fail, type Logger, ok, type UpdateInstaller } from '@dck/core'

const FOLDER_PREFIX = 'dev-cockpit-update-'
// pkexec's own exit code when the user dismissed the password dialog
const DIALOG_DISMISSED = 126

export interface CommandResult {
  readonly code: number | null
  readonly stderr: string
}

export interface DebInstallerDeps {
  readonly fetch: typeof fetch
  // Runs a program without a shell
  run(command: string, args: readonly string[]): Promise<CommandResult>
  // The system's temporary folder
  readonly tempRoot: string
  readonly userAgent: string
  readonly logger: Logger
}

// No timeout: pkexec waits while the user types the password
export const runProgram = (command: string, args: readonly string[]): Promise<CommandResult> =>
  new Promise((resolve) => {
    execFile(command, [...args], { maxBuffer: 16 * 1024 * 1024 }, (error, _stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : null) : 0
      resolve({ code, stderr: String(stderr) })
    })
  })

const lastLine = (text: string) => text.trim().split('\n').at(-1)?.slice(0, 200) ?? ''

// Downloads the release's .deb, hashing it on the way, and installs it as root through polkit
export function createDebInstaller(deps: DebInstallerDeps): UpdateInstaller {
  const files = createReleaseDownload({ ...deps, folderPrefix: FOLDER_PREFIX })

  return {
    readText: files.readText,
    download: files.download,
    discard: files.discard,

    // apt resolves the package's dependencies; polkit shows the system's password dialog
    async install(file) {
      if (!files.owns(file)) return fail(errorBody('DCK-UPD-006', 'file outside the update folder'))
      const result = await deps
        .run('pkexec', ['/usr/bin/apt-get', 'install', '-y', file])
        .catch((error: unknown) => ({ code: null, stderr: String(error) }))
      if (result.code === 0) return ok('installed')
      if (result.code === DIALOG_DISMISSED) return ok('cancelled')
      deps.logger.warn('update install command failed', {
        code: result.code,
        stderr: lastLine(result.stderr),
      })
      return fail(errorBody('DCK-UPD-006', `exit ${result.code}`))
    },
  }
}
