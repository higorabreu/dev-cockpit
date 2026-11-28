// This system's paths are POSIX, so they are joined the same when a test runs on Windows
import { dirname, join } from 'node:path/posix'
import { type ErrorBody, errorBody, fail, macImageName, ok, type Result } from '@dck/core'
import type { CommandRunner, InstallTarget } from './system.ts'

const APPLICATIONS = '/Applications'
const APP = `${APPLICATIONS}/Dev Cockpit.app`
// Copied beside the old app first, so a failed copy leaves the old one as it was
const STAGING = `${APPLICATIONS}/.Dev Cockpit.app.new`
// package-mac.mjs puts the app's package.json and the dck wrapper here
const MANIFEST = `${APP}/Contents/Resources/app/package.json`
const DCK = `${APP}/Contents/Resources/bin/dck`

export type LinkState =
  | { readonly kind: 'missing' }
  | { readonly kind: 'link'; readonly target: string }
  | { readonly kind: 'other' }

export interface MacFiles {
  readText(path: string): Promise<string | undefined>
  exists(path: string): Promise<boolean>
  writable(directory: string): Promise<boolean>
  linkState(path: string): Promise<LinkState>
  // False when the link could not be made
  symlink(target: string, path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
}

export interface MacDeps {
  readonly run: CommandRunner
  readonly files: MacFiles
  // The PATH's folders
  readonly path: readonly string[]
  readonly home: string
  out(line: string): void
}

// Copies the app out of the release's image into /Applications and puts `dck` on the PATH
export function createMacTarget(deps: MacDeps): InstallTarget {
  const { files, run, out } = deps

  async function copyApp(source: string, version: string): Promise<Result<void, ErrorBody>> {
    if (!(await files.exists(source))) return fail(errorBody('DCK-INS-006', 'no app in the image'))
    const replacing = await files.exists(APP)
    // /Applications is the admin group's; another user needs sudo, as dragging there asks for a password
    const admin = !(await files.writable(APPLICATIONS))
    out(
      admin
        ? `Copying Dev Cockpit ${version} to /Applications; sudo may ask for your password.`
        : `Copying Dev Cockpit ${version} to /Applications.`,
    )
    const step = (command: string, args: readonly string[]) =>
      admin ? run.interactive('sudo', [command, ...args]) : run.interactive(command, args)
    await step('rm', ['-rf', STAGING])
    // ditto keeps the bundle's links, attributes and signature
    const copied = await step('ditto', [source, STAGING])
    if (copied !== 0) {
      await step('rm', ['-rf', STAGING])
      return fail(errorBody('DCK-INS-006', `ditto exit ${copied}`))
    }
    if ((await step('rm', ['-rf', APP])) !== 0 || (await step('mv', [STAGING, APP])) !== 0) {
      return fail(errorBody('DCK-INS-006', `could not replace ${APP}`))
    }
    if (replacing) out('If Dev Cockpit is running, quit it and open it again.')
    return ok(undefined)
  }

  // The first writable folder of the PATH among the usual ones; a dck that is not ours is left alone
  async function linkCli(): Promise<void> {
    const candidates = [
      '/usr/local/bin',
      join(deps.home, '.local', 'bin'),
      join(deps.home, 'bin'),
      '/opt/homebrew/bin',
    ].filter((folder) => deps.path.includes(folder))
    for (const folder of candidates) {
      if (!(await files.writable(folder))) continue
      const link = join(folder, 'dck')
      const state = await files.linkState(link)
      if (state.kind === 'link' && state.target === DCK) return out('The dck command is ready.')
      if (state.kind !== 'missing') {
        return out(`${link} is another program; to use Dev Cockpit's: ln -sf '${DCK}' '${link}'`)
      }
      if (await files.symlink(DCK, link)) return out(`Linked the dck command in ${folder}.`)
    }
    out(`To use the dck command, run: sudo ln -sf '${DCK}' /usr/local/bin/dck`)
  }

  return {
    openHint: 'Open it from Applications',

    packageName: (version) => macImageName(version, 'arm64'),

    async installedVersion() {
      const text = await files.readText(MANIFEST)
      if (text === undefined) return undefined
      try {
        const version: unknown = (JSON.parse(text) as { version?: unknown }).version
        return typeof version === 'string' ? version : undefined
      } catch {
        return undefined
      }
    },

    async install({ file, version }) {
      // Mounted inside the download's own private folder, so no other mount point is guessed
      const mount = join(dirname(file), 'image')
      await files.mkdir(mount)
      const attach = ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, file]
      const attached = await run.capture('hdiutil', attach)
      if (attached.code !== 0) {
        return fail(errorBody('DCK-INS-006', `hdiutil attach exit ${attached.code}`))
      }
      let copied: Result<void, ErrorBody>
      try {
        copied = await copyApp(join(mount, 'Dev Cockpit.app'), version)
      } finally {
        const detached = await run.capture('hdiutil', ['detach', mount, '-quiet'])
        if (detached.code !== 0) out(`The image is still mounted at ${mount}; eject it in Finder.`)
      }
      if (!copied.ok) return copied
      await linkCli()
      return ok(undefined)
    },
  }
}
