import { describe, expect, it } from 'vitest'
import { createAptTarget } from './apt.ts'

const FILE = '/tmp/dev-cockpit-install-a1/dev-cockpit_0.10.0_amd64.deb'

function setup(options: { isRoot?: boolean; query?: string; queryCode?: number; exit?: number }) {
  const commands: (readonly string[])[] = []
  const modes: [string, number][] = []
  const lines: string[] = []
  const target = createAptTarget({
    arch: 'x64',
    isRoot: options.isRoot ?? false,
    run: {
      async capture(command, args) {
        commands.push([command, ...args])
        return { code: options.queryCode ?? 0, stdout: options.query ?? '' }
      },
      async interactive(command, args) {
        commands.push([command, ...args])
        return options.exit ?? 0
      },
    },
    chmod: async (path, mode) => {
      modes.push([path, mode])
    },
    out: (line) => lines.push(line),
  })
  return { target, commands, modes, lines }
}

describe('createAptTarget', () => {
  it('should name the .deb for the processor', () => {
    expect(setup({}).target.packageName('0.10.0')).toBe('dev-cockpit_0.10.0_amd64.deb')
  })

  it('should read the installed version when dpkg lists the package as installed', async () => {
    const { target, commands } = setup({ query: 'ii  0.9.0' })

    expect(await target.installedVersion()).toBe('0.9.0')
    expect(commands[0]?.slice(0, 2)).toEqual(['dpkg-query', '--show'])
  })

  it('should find no version when the package is absent or only its configuration is left', async () => {
    expect(await setup({ queryCode: 1 }).target.installedVersion()).toBeUndefined()
    expect(await setup({ query: 'rc  0.9.0' }).target.installedVersion()).toBeUndefined()
  })

  it('should say sudo may ask and install with apt when the user is not root', async () => {
    const { target, commands, modes, lines } = setup({})

    const result = await target.install({ file: FILE, version: '0.10.0', downgrade: false })

    expect(result).toEqual({ ok: true, value: undefined })
    expect(lines).toEqual([
      'Installing Dev Cockpit 0.10.0 with apt; sudo may ask for your password.',
    ])
    expect(commands).toEqual([['sudo', 'apt', 'install', '-y', FILE]])
    expect(modes).toEqual([
      ['/tmp/dev-cockpit-install-a1', 0o755],
      [FILE, 0o644],
    ])
  })

  it('should run apt without sudo and allow the downgrade when root asks for an older release', async () => {
    const { target, commands } = setup({ isRoot: true })

    await target.install({ file: FILE, version: '0.9.0', downgrade: true })

    expect(commands).toEqual([['apt', 'install', '-y', '--allow-downgrades', FILE]])
  })

  it('should fail the installation when apt or sudo exits with an error', async () => {
    const result = await setup({ exit: 100 }).target.install({
      file: FILE,
      version: '0.10.0',
      downgrade: false,
    })

    expect(!result.ok && result.error.data?.code).toBe('DCK-INS-006')
    expect(!result.ok && result.error.message).toContain('sudo exit 100')
  })
})
