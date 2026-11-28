// This system's paths are Windows', so they are joined the same when a test runs on Linux or macOS
import { join } from 'node:path/win32'
import { type ErrorBody, errorBody, fail, ok, type Result, windowsZipName } from '@dck/core'
import type { InstallTarget } from './system.ts'

const PRODUCT = 'Dev Cockpit'

export type PathChange = 'added' | 'present' | 'failed'

// What the Windows install does to the machine; each step reports instead of throwing
export interface WindowsSystem {
  readText(path: string): Promise<string | undefined>
  exists(path: string): Promise<boolean>
  // Recursive; true when nothing is left at the path
  remove(path: string): Promise<boolean>
  rename(from: string, to: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  // Stops the processes run from the folder, the window and its daemon; how many there were
  stopRunning(folder: string): Promise<number>
  unpack(zip: string, into: string): Promise<boolean>
  shortcut(link: string, target: string): Promise<boolean>
  // The user's own PATH, kept in the registry, told to the running apps once changed
  addToUserPath(folder: string): Promise<PathChange>
}

export interface WindowsDeps {
  readonly system: WindowsSystem
  // %LOCALAPPDATA% and %APPDATA%
  readonly localAppData: string
  readonly appData: string
  out(line: string): void
}

const failed = (detail: string) => fail(errorBody('DCK-INS-006', detail))

// Unpacks the release's zip into the user's own programs folder, so no administrator is needed, adds a Start
// menu entry and puts `dck` on the user's PATH
export function createWindowsTarget(deps: WindowsDeps): InstallTarget {
  const { system, out } = deps
  const programs = join(deps.localAppData, 'Programs')
  const app = join(programs, PRODUCT)
  // Unpacked beside the old app first, so a failed unpack leaves the old one as it was
  const staging = join(programs, `.${PRODUCT}.new`)
  const old = join(programs, `.${PRODUCT}.old`)
  const executable = join(app, `${PRODUCT}.exe`)
  const bin = join(app, 'resources', 'bin')

  async function unpack(file: string): Promise<Result<string, ErrorBody>> {
    await system.mkdir(programs)
    await system.remove(staging)
    if (!(await system.unpack(file, staging))) {
      await system.remove(staging)
      return failed('could not unpack the zip')
    }
    const unpacked = join(staging, PRODUCT)
    if (!(await system.exists(join(unpacked, `${PRODUCT}.exe`)))) {
      await system.remove(staging)
      return failed('no app in the zip')
    }
    return ok(unpacked)
  }

  // Windows will not move a folder whose programs run, so the running cockpit stops first
  async function replace(unpacked: string): Promise<Result<boolean, ErrorBody>> {
    const stopped = await system.stopRunning(app)
    if (stopped > 0) out('Closed the running Dev Cockpit to replace it.')
    await system.remove(old)
    if ((await system.exists(app)) && !(await system.rename(app, old))) {
      await system.remove(staging)
      return failed(`could not move ${app}; close Dev Cockpit and try again`)
    }
    if (!(await system.rename(unpacked, app))) {
      if (await system.exists(old)) await system.rename(old, app)
      await system.remove(staging)
      return failed(`could not place the app in ${app}`)
    }
    await system.remove(old)
    await system.remove(staging)
    return ok(stopped > 0)
  }

  async function addShortcut() {
    const link = join(
      deps.appData,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      `${PRODUCT}.lnk`,
    )
    if (!(await system.shortcut(link, executable)))
      out(`Could not add ${PRODUCT} to the Start menu.`)
  }

  async function addCli() {
    const change = await system.addToUserPath(bin)
    if (change === 'added')
      out('Added the dck command to your PATH; open a new terminal to use it.')
    else if (change === 'present') out('The dck command is ready.')
    else out(`To use the dck command, add ${bin} to your PATH.`)
  }

  return {
    openHint: 'Open it from the Start menu',

    packageName: (version) => windowsZipName(version, 'x64'),

    async installedVersion() {
      const text = await system.readText(join(app, 'resources', 'app', 'package.json'))
      if (text === undefined) return undefined
      try {
        const version: unknown = (JSON.parse(text) as { version?: unknown }).version
        return typeof version === 'string' ? version : undefined
      } catch {
        // A damaged manifest is an install to replace, not a version
        return undefined
      }
    },

    async install({ file, version }) {
      out(`Unpacking Dev Cockpit ${version} to ${app}.`)
      const unpacked = await unpack(file)
      if (!unpacked.ok) return unpacked
      const replaced = await replace(unpacked.value)
      if (!replaced.ok) return replaced
      await addShortcut()
      await addCli()
      return ok(undefined)
    },
  }
}
