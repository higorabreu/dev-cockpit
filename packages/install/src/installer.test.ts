import { errorBody, fail, ok, type Release } from '@dck/core'
import { FakeUpdateInstaller } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { type InstallerDeps, type InstallOptions, runInstaller } from './installer.ts'
import type { InstallRequest, InstallTarget } from './system.ts'

const BASE = 'https://github.com/acme/backend/releases/download/v0.10.0'
const NAME = 'dev-cockpit_0.10.0_amd64.deb'
const HASH = 'a'.repeat(64)
const FILE = `/tmp/dev-cockpit-install-a1/${NAME}`

const release = (version = '0.10.0'): Release => ({
  version,
  page: `https://github.com/acme/backend/releases/tag/v${version}`,
  assets: [
    { name: `dev-cockpit_${version}_amd64.deb`, url: `${BASE}/${NAME}`, size: 92_534_204 },
    { name: 'SHA256SUMS', url: `${BASE}/SHA256SUMS`, size: 190 },
  ],
})

interface Options {
  readonly latest?: Awaited<ReturnType<InstallerDeps['releases']['latest']>>
  readonly installed?: string
  readonly sha256?: string
  readonly sums?: string
  readonly unsupported?: string
  readonly installResult?: Awaited<ReturnType<InstallTarget['install']>>
}

function setup(options: Options = {}) {
  const lines: string[] = []
  const asked: string[] = []
  const installs: InstallRequest[] = []
  const files = new FakeUpdateInstaller()
  files.texts.set(
    `${BASE}/SHA256SUMS`,
    ok(options.sums ?? `${HASH}  ${NAME}\n${HASH}  dev-cockpit_0.9.0_amd64.deb\n`),
  )
  files.downloads.set(`${BASE}/${NAME}`, ok({ file: FILE, sha256: options.sha256 ?? HASH }))
  const target: InstallTarget = {
    openHint: 'Open it from the application menu',
    packageName: (version) => `dev-cockpit_${version}_amd64.deb`,
    installedVersion: async () => options.installed,
    async install(request) {
      installs.push(request)
      return options.installResult ?? ok(undefined)
    },
  }
  const deps: InstallerDeps = {
    releases: {
      async latest() {
        asked.push('latest')
        return options.latest ?? ok(release())
      },
      async tagged(version) {
        asked.push(version)
        return ok(version === '0.9.0' ? release('0.9.0') : undefined)
      },
    },
    files,
    target: options.unsupported ? { unsupported: options.unsupported } : target,
    out: (line) => lines.push(line),
  }
  const run = (installOptions: InstallOptions = { downloadOnly: false }) =>
    runInstaller(installOptions, deps)
  return { run, lines, asked, installs, files }
}

const codeOf = (result: { ok: boolean; error?: { data?: { code?: string } } }) =>
  result.ok ? undefined : result.error?.data?.code

describe('runInstaller', () => {
  it('should download, verify and install the latest release when nothing is installed', async () => {
    const { run, lines, installs, files } = setup()

    const result = await run()

    expect(result).toEqual({ ok: true, value: undefined })
    expect(installs).toEqual([{ file: FILE, version: '0.10.0', downgrade: false }])
    expect(files.discarded).toEqual([FILE])
    expect(lines).toEqual([
      `Downloading Dev Cockpit 0.10.0 (${NAME}, 88 MB).`,
      'Checksum verified (SHA-256).',
      'Dev Cockpit 0.10.0 is installed. Open it from the application menu.',
    ])
  })

  it('should say so and install nothing when the same version is installed', async () => {
    const { run, lines, installs, files } = setup({ installed: '0.10.0' })

    expect((await run()).ok).toBe(true)
    expect(lines).toEqual(['Dev Cockpit 0.10.0 is already installed.'])
    expect(installs).toEqual([])
    expect(files.discarded).toEqual([])
  })

  it('should keep a newer installed version when the latest release is older', async () => {
    const { run, lines, installs } = setup({ installed: '0.11.0' })

    expect((await run()).ok).toBe(true)
    expect(lines).toEqual([
      'Dev Cockpit 0.11.0 is installed, newer than the latest release 0.10.0.',
    ])
    expect(installs).toEqual([])
  })

  it('should install an older release as a downgrade when the user names it', async () => {
    const { run, asked, installs } = setup({ installed: '0.10.0' })

    await run({ version: '0.9.0', downloadOnly: false })

    expect(asked).toEqual(['0.9.0'])
    expect(installs[0]?.downgrade).toBe(true)
  })

  it('should fail as not found when the named version has no release', async () => {
    const { run } = setup()

    expect(codeOf(await run({ version: '0.0.1', downloadOnly: false }))).toBe('DCK-INS-003')
  })

  it('should keep the file and install nothing when only downloading', async () => {
    const { run, lines, installs, files } = setup({ installed: '0.10.0' })

    expect((await run({ downloadOnly: true })).ok).toBe(true)
    expect(installs).toEqual([])
    expect(files.discarded).toEqual([])
    expect(lines.at(-1)).toBe(`Downloaded to ${FILE}; nothing was installed.`)
  })

  it('should refuse and remove the file when the checksum does not match', async () => {
    const { run, installs, files } = setup({ sha256: 'b'.repeat(64) })

    const result = await run()

    expect(codeOf(result)).toBe('DCK-INS-005')
    expect(installs).toEqual([])
    expect(files.discarded).toEqual([FILE])
  })

  it('should fail with no package when the release has no file or checksum for the system', async () => {
    const missing = setup({ latest: ok({ ...release(), assets: [] }) })
    const unlisted = setup({ sums: `${HASH}  other.deb\n` })

    expect(codeOf(await missing.run())).toBe('DCK-UPD-003')
    expect(codeOf(await unlisted.run())).toBe('DCK-UPD-003')
  })

  it('should fail with the system named when there is no installer for it', async () => {
    const { run, asked } = setup({ unsupported: 'Windows' })

    const result = await run()

    expect(codeOf(result)).toBe('DCK-INS-001')
    expect(!result.ok && result.error.message).toBe('No installer for this system yet: Windows')
    expect(asked).toEqual([])
  })

  it('should keep only the detail of the release source when GitHub cannot be read', async () => {
    const { run } = setup({ latest: fail(errorBody('DCK-UPD-001', 'HTTP 403')) })

    const result = await run()

    expect(!result.ok && result.error.message).toBe(
      'Could not read the release from GitHub: HTTP 403',
    )
  })

  it('should remove the file and pass the failure on when the installation fails', async () => {
    const { run, files } = setup({ installResult: fail(errorBody('DCK-INS-006', 'sudo exit 1')) })

    expect(codeOf(await run())).toBe('DCK-INS-006')
    expect(files.discarded).toEqual([FILE])
  })
})
