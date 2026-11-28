import { chmod } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { createGitHubReleaseSource } from '@dck/adapter-github'
import { createFetchHttpClient, createReleaseDownload } from '@dck/adapter-node-fetch'
import type { Logger } from '@dck/core'
import manifest from '../package.json' with { type: 'json' }
import { createAptTarget } from './apt.ts'
import { parseArgs, USAGE } from './args.ts'
import { runInstaller } from './installer.ts'
import { createMacTarget } from './mac.ts'
import { commandRunner, hasCommand, macFiles } from './node-system.ts'
import { pickSystem } from './system.ts'
import { createWindowsTarget } from './windows.ts'
import { createWindowsSystem } from './windows-system.ts'

const REPOSITORY = 'higorabreu/dev-cockpit'
const RELEASES_PAGE = `https://github.com/${REPOSITORY}/releases`
// Exit codes from sysexits.h, as the dck command uses
const EXIT = { ok: 0, failed: 1, usage: 64 } as const

const out = (line: string) => process.stdout.write(`${line}\n`)
const warn = (message: string, context?: object) => {
  process.stderr.write(`Warning: ${message} ${JSON.stringify(context ?? {})}\n`)
}
const logger: Logger = { info() {}, warn, error: warn }

async function main(argv: readonly string[]): Promise<number> {
  const command = parseArgs(argv)
  if (command.kind === 'help') {
    process.stdout.write(USAGE)
    return EXIT.ok
  }
  if (command.kind === 'usage') {
    process.stderr.write(`${command.problem}\n\n${USAGE}`)
    return EXIT.usage
  }

  const path = process.env.PATH ?? ''
  const hasApt =
    process.platform === 'linux' &&
    (await hasCommand('apt', path)) &&
    (await hasCommand('dpkg-query', path))
  const system = pickSystem(process.platform, process.arch, hasApt)
  const target =
    system.kind === 'debian'
      ? createAptTarget({
          run: commandRunner,
          arch: process.arch,
          isRoot: process.getuid?.() === 0,
          // Unreadable to _apt, the file is still read by apt as root, which only adds a notice
          chmod: (file, mode) =>
            chmod(file, mode).catch((error: unknown) =>
              warn('chmod failed', { file, error: String(error) }),
            ),
          out,
        })
      : system.kind === 'mac'
        ? createMacTarget({
            run: commandRunner,
            files: macFiles,
            path: path.split(delimiter),
            home: homedir(),
            out,
          })
        : system.kind === 'windows'
          ? createWindowsTarget({
              system: createWindowsSystem(),
              localAppData: process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
              appData: process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
              out,
            })
          : { unsupported: system.system }

  // D71's rule: the requests carry only the version, in the User-Agent
  const result = await runInstaller(command, {
    releases: createGitHubReleaseSource({
      http: createFetchHttpClient(),
      repository: REPOSITORY,
      appVersion: manifest.version,
    }),
    files: createReleaseDownload({
      fetch,
      tempRoot: tmpdir(),
      folderPrefix: 'dev-cockpit-install-',
      userAgent: `dev-cockpit/${manifest.version}`,
      logger,
    }),
    target,
    out,
  })
  if (result.ok) return EXIT.ok
  const code = result.error.data?.code ?? 'error'
  process.stderr.write(`Error (${code}): ${result.error.message}\n`)
  process.stderr.write(`Releases and the manual install: ${RELEASES_PAGE}\n`)
  return EXIT.failed
}

process.exitCode = await main(process.argv.slice(2))
