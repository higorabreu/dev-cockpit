import { dirname } from 'node:path'
import { debPackageName, errorBody, fail, ok } from '@dck/core'
import type { CommandRunner, InstallTarget } from './system.ts'

const PACKAGE = 'dev-cockpit'

export interface AptDeps {
  readonly run: CommandRunner
  // Node's name for the processor
  readonly arch: string
  // Root needs no sudo
  readonly isRoot: boolean
  chmod(path: string, mode: number): Promise<void>
  out(line: string): void
}

// Installs the release's .deb with apt, which resolves its dependencies, as `sudo apt install` by hand does
export function createAptTarget(deps: AptDeps): InstallTarget {
  return {
    openHint: 'Open it from the application menu',

    packageName: (version) => debPackageName(version, deps.arch),

    async installedVersion() {
      const { code, stdout } = await deps.run.capture('dpkg-query', [
        '--show',
        // dpkg-query's own fields, not placeholders of this code
        `--showformat=\${db:Status-Abbrev} \${Version}`,
        PACKAGE,
      ])
      // `ii` is installed; a removed package can keep its configuration and a version
      const match = /^ii\s+(\S+)/.exec(stdout.trim())
      return code === 0 && match?.[1] ? match[1] : undefined
    },

    async install({ file, version, downgrade }) {
      // apt reads a local package as its unprivileged _apt user, so the checked file is opened to reading
      await deps.chmod(dirname(file), 0o755)
      await deps.chmod(file, 0o644)
      const apt = ['apt', 'install', '-y', ...(downgrade ? ['--allow-downgrades'] : []), file]
      if (deps.isRoot) deps.out(`Installing Dev Cockpit ${version} with apt.`)
      else deps.out(`Installing Dev Cockpit ${version} with apt; sudo may ask for your password.`)
      const [command = 'apt', ...args] = deps.isRoot ? apt : ['sudo', ...apt]
      const code = await deps.run.interactive(command, args)
      return code === 0 ? ok(undefined) : fail(errorBody('DCK-INS-006', `${command} exit ${code}`))
    },
  }
}
