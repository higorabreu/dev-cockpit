import { describe, expect, it } from 'vitest'
import { createMacTarget, type LinkState } from './mac.ts'

const FILE = '/private/tmp/dev-cockpit-install-a1/dev-cockpit_0.10.0_arm64.dmg'
const MOUNT = '/private/tmp/dev-cockpit-install-a1/image'
const APP = '/Applications/Dev Cockpit.app'
const STAGING = '/Applications/.Dev Cockpit.app.new'
const DCK = `${APP}/Contents/Resources/bin/dck`

interface Options {
  readonly existing?: readonly string[]
  readonly writable?: readonly string[]
  readonly links?: Readonly<Record<string, LinkState>>
  readonly manifest?: string
  readonly path?: readonly string[]
  readonly exits?: Readonly<Record<string, number>>
}

function setup(options: Options = {}) {
  const commands: (readonly string[])[] = []
  const linked: [string, string][] = []
  const lines: string[] = []
  const existing = new Set(options.existing ?? [`${MOUNT}/Dev Cockpit.app`])
  const exitOf = (command: string, args: readonly string[]) =>
    options.exits?.[[command, ...args].join(' ')] ?? options.exits?.[command] ?? 0
  const target = createMacTarget({
    run: {
      async capture(command, args) {
        commands.push([command, ...args])
        return { code: exitOf(command, args), stdout: '' }
      },
      async interactive(command, args) {
        commands.push([command, ...args])
        return exitOf(command, args)
      },
    },
    files: {
      readText: async (path) => (path.endsWith('package.json') ? options.manifest : undefined),
      exists: async (path) => existing.has(path),
      writable: async (path) =>
        (options.writable ?? ['/Applications', '/usr/local/bin']).includes(path),
      linkState: async (path) => options.links?.[path] ?? { kind: 'missing' },
      symlink: async (to, path) => {
        linked.push([to, path])
        return true
      },
      mkdir: async () => {},
    },
    path: options.path ?? ['/usr/bin', '/usr/local/bin'],
    home: '/Users/ana',
    out: (line) => lines.push(line),
  })
  return { target, commands, linked, lines }
}

const request = { file: FILE, version: '0.10.0', downgrade: false }

describe('createMacTarget', () => {
  it('should name the Apple Silicon image', () => {
    expect(setup().target.packageName('0.10.0')).toBe('dev-cockpit_0.10.0_arm64.dmg')
  })

  it('should read the installed version from the app when it is in Applications', async () => {
    expect(await setup({ manifest: '{"version":"0.9.0"}' }).target.installedVersion()).toBe('0.9.0')
    expect(await setup({ manifest: 'not json' }).target.installedVersion()).toBeUndefined()
    expect(await setup().target.installedVersion()).toBeUndefined()
  })

  it('should mount, copy beside, replace, detach and link dck when Applications is writable', async () => {
    const { target, commands, linked, lines } = setup()

    const result = await target.install(request)

    expect(result).toEqual({ ok: true, value: undefined })
    expect(commands).toEqual([
      ['hdiutil', 'attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', MOUNT, FILE],
      ['rm', '-rf', STAGING],
      ['ditto', `${MOUNT}/Dev Cockpit.app`, STAGING],
      ['rm', '-rf', APP],
      ['mv', STAGING, APP],
      ['hdiutil', 'detach', MOUNT, '-quiet'],
    ])
    expect(linked).toEqual([[DCK, '/usr/local/bin/dck']])
    expect(lines).toEqual([
      'Copying Dev Cockpit 0.10.0 to /Applications.',
      'Linked the dck command in /usr/local/bin.',
    ])
  })

  it('should copy through sudo and say so when Applications is not writable', async () => {
    const { target, commands, lines } = setup({ writable: [] })

    await target.install(request)

    expect(commands[2]).toEqual(['sudo', 'ditto', `${MOUNT}/Dev Cockpit.app`, STAGING])
    expect(lines[0]).toBe(
      'Copying Dev Cockpit 0.10.0 to /Applications; sudo may ask for your password.',
    )
  })

  it('should keep the old app and still detach when the copy fails', async () => {
    const { target, commands } = setup({
      existing: [`${MOUNT}/Dev Cockpit.app`, APP],
      exits: { ditto: 1 },
    })

    const result = await target.install(request)

    expect(!result.ok && result.error.data?.code).toBe('DCK-INS-006')
    expect(commands.map((command) => command.join(' '))).not.toContain(`rm -rf ${APP}`)
    expect(commands.at(-1)).toEqual(['hdiutil', 'detach', MOUNT, '-quiet'])
  })

  it('should fail and copy nothing when the image does not mount', async () => {
    const { target, commands } = setup({ exits: { hdiutil: 1 } })

    const result = await target.install(request)

    expect(!result.ok && result.error.data?.code).toBe('DCK-INS-006')
    expect(commands).toHaveLength(1)
  })

  it('should ask to quit the running app when an older one was replaced', async () => {
    const { target, lines } = setup({ existing: [`${MOUNT}/Dev Cockpit.app`, APP] })

    await target.install(request)

    expect(lines).toContain('If Dev Cockpit is running, quit it and open it again.')
  })

  it('should leave a dck that is not ours and print the line to replace it', async () => {
    const { target, linked, lines } = setup({
      links: { '/usr/local/bin/dck': { kind: 'other' } },
    })

    await target.install(request)

    expect(linked).toEqual([])
    expect(lines.at(-1)).toBe(
      `/usr/local/bin/dck is another program; to use Dev Cockpit's: ln -sf '${DCK}' '/usr/local/bin/dck'`,
    )
  })

  it('should keep the link when dck already points to the app', async () => {
    const { target, linked, lines } = setup({
      links: { '/usr/local/bin/dck': { kind: 'link', target: DCK } },
    })

    await target.install(request)

    expect(linked).toEqual([])
    expect(lines.at(-1)).toBe('The dck command is ready.')
  })

  it('should link in the home bin folder when it is the writable one on the PATH', async () => {
    const { target, linked } = setup({
      path: ['/usr/local/bin', '/Users/ana/.local/bin'],
      writable: ['/Applications', '/Users/ana/.local/bin'],
    })

    await target.install(request)

    expect(linked).toEqual([[DCK, '/Users/ana/.local/bin/dck']])
  })

  it('should print the link command when no folder of the PATH is writable', async () => {
    const { target, lines } = setup({ writable: ['/Applications'] })

    await target.install(request)

    expect(lines.at(-1)).toBe(
      `To use the dck command, run: sudo ln -sf '${DCK}' /usr/local/bin/dck`,
    )
  })
})
