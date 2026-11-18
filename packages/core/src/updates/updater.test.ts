import { describe, expect, it } from 'vitest'
import { errorBody } from '../ipc/protocol.ts'
import type { Logger } from '../ports/logger.ts'
import type { Release } from '../ports/updates.ts'
import { fail, ok } from '../result.ts'
import { FakeReleaseSource, FakeScheduler, FakeUpdateInstaller } from '../testing/fakes.ts'
import { CHECK_INTERVAL_MS, createUpdater, type UpdateMode, type UpdateState } from './updater.ts'

const PAGE = 'https://github.example.com/acme/backend/releases/tag/v0.10.0'
const DEB = 'https://github.example.com/acme/backend/releases/download/v0.10.0/deb'
const SUMS = 'https://github.example.com/acme/backend/releases/download/v0.10.0/sums'
const HASH = 'ab'.repeat(32)

const release = (version = '0.10.0'): Release => ({
  version,
  page: PAGE,
  assets: [
    { name: `dev-cockpit_${version}_amd64.deb`, url: DEB, size: 100 },
    { name: 'SHA256SUMS', url: SUMS, size: 10 },
  ],
})

// Lets the promises the updater started on its own (the timer, the automatic install) finish
const settle = () => new Promise((resolve) => setImmediate(resolve))

function setup(
  options: {
    mode?: UpdateMode
    releases?: ConstructorParameters<typeof FakeReleaseSource>[0]
    installer?: FakeUpdateInstaller | null
    dismissed?: string
    arch?: string
  } = {},
) {
  let mode: UpdateMode = options.mode ?? 'notify'
  let dismissed = options.dismissed
  const source = new FakeReleaseSource(options.releases ?? [ok(release())])
  const installer = options.installer === null ? undefined : (options.installer ?? goodInstaller())
  const scheduler = new FakeScheduler()
  const states: UpdateState[] = []
  const warnings: string[] = []
  const logger: Logger = { info() {}, warn: (message) => void warnings.push(message), error() {} }
  const updater = createUpdater({
    source,
    installer,
    currentVersion: '0.9.0',
    arch: options.arch ?? 'x64',
    mode: () => mode,
    scheduler,
    dismissed: {
      get: () => dismissed,
      set: (version) => {
        dismissed = version
      },
    },
    logger,
    onChange: (state) => void states.push(state),
  })
  return {
    updater,
    source,
    installer,
    scheduler,
    states,
    warnings,
    dismissed: () => dismissed,
    setMode: (next: UpdateMode) => {
      mode = next
      updater.modeChanged()
    },
  }
}

function goodInstaller(sha256 = HASH) {
  const installer = new FakeUpdateInstaller()
  installer.texts.set(SUMS, ok(`${HASH}  dev-cockpit_0.10.0_amd64.deb\n`))
  installer.downloads.set(DEB, ok({ file: '/tmp/update/dev-cockpit_0.10.0_amd64.deb', sha256 }))
  return installer
}

describe('createUpdater checks', () => {
  it('should never ask for releases when the setting is off', async () => {
    const { updater, source, scheduler } = setup({ mode: 'off' })

    updater.start()
    await updater.check()
    scheduler.advance(CHECK_INTERVAL_MS * 3)
    await settle()

    expect(source.calls).toBe(0)
    expect(updater.state().notice).toEqual({ kind: 'none' })
  })

  it('should show the newer version and offer it when notifying finds one', async () => {
    const { updater, installer } = setup()

    const state = await updater.check()

    expect(state.check).toEqual({ kind: 'available', version: '0.10.0' })
    expect(state.notice).toEqual({ kind: 'available', version: '0.10.0' })
    expect(state.offer).toBe('0.10.0')
    expect(installer?.installed).toEqual([])
  })

  it('should say up to date and show nothing when the latest release is the running one', async () => {
    const { updater } = setup({ releases: [ok(release('0.9.0'))] })

    const state = await updater.check()

    expect(state.check).toEqual({ kind: 'current' })
    expect(state.notice).toEqual({ kind: 'none' })
    expect(state.offer).toBeUndefined()
  })

  it('should check again every 12 hours when the setting is on', async () => {
    const { updater, source, scheduler } = setup({ releases: [ok(release('0.9.0'))] })

    updater.start()
    await settle()
    scheduler.advance(CHECK_INTERVAL_MS - 1)
    await settle()
    const before = source.calls
    scheduler.advance(1)
    await settle()

    expect(before).toBe(1)
    expect(source.calls).toBe(2)
  })

  it('should keep the notice and say the check failed when there is no answer', async () => {
    const { updater, warnings } = setup({
      releases: [ok(release()), fail(errorBody('DCK-UPD-001', 'offline'))],
    })
    await updater.check()

    const state = await updater.check()

    expect(state.check).toEqual({ kind: 'failed', code: 'DCK-UPD-001' })
    expect(state.notice).toEqual({ kind: 'available', version: '0.10.0' })
    expect(warnings).toEqual(['update check failed'])
  })

  it('should forget the release and stop checking when the setting turns off', async () => {
    const { updater, source, scheduler, setMode } = setup()
    await updater.check()

    setMode('off')
    scheduler.advance(CHECK_INTERVAL_MS * 2)
    await settle()

    expect(source.calls).toBe(1)
    expect(updater.state()).toEqual({
      canInstall: true,
      check: { kind: 'never' },
      notice: { kind: 'none' },
    })
  })

  it('should check at once when the setting turns on', async () => {
    const { source, setMode } = setup({ mode: 'off' })

    setMode('notify')
    await settle()

    expect(source.calls).toBe(1)
  })
})

describe('createUpdater dismissal', () => {
  it('should hide the notice and remember the version when the user dismisses it', async () => {
    const { updater, dismissed } = setup()
    await updater.check()

    updater.dismiss()

    expect(updater.state().notice).toEqual({ kind: 'none' })
    expect(updater.state().offer).toBe('0.10.0')
    expect(dismissed()).toBe('0.10.0')
  })

  it('should keep the notice hidden when a later run finds the dismissed version', async () => {
    const { updater } = setup({ dismissed: '0.10.0' })

    const state = await updater.check()

    expect(state.notice).toEqual({ kind: 'none' })
    expect(state.check).toEqual({ kind: 'available', version: '0.10.0' })
  })

  it('should show the notice again when a version newer than the dismissed one arrives', async () => {
    const { updater } = setup({ dismissed: '0.10.0', releases: [ok(release('0.11.0'))] })

    const state = await updater.check()

    expect(state.notice).toEqual({ kind: 'available', version: '0.11.0' })
  })
})

describe('createUpdater install', () => {
  it('should download, verify and install by itself when the setting is install', async () => {
    const { updater, installer } = setup({ mode: 'install' })

    await updater.check()
    await settle()

    expect(installer?.installed).toEqual(['/tmp/update/dev-cockpit_0.10.0_amd64.deb'])
    expect(installer?.discarded).toEqual(['/tmp/update/dev-cockpit_0.10.0_amd64.deb'])
    expect(updater.state().notice).toEqual({ kind: 'installed', version: '0.10.0' })
    expect(updater.state().offer).toBeUndefined()
  })

  it('should go through downloading with its percent and installing when updating', async () => {
    const installer = goodInstaller()
    installer.progress = [0, 0.004, 0.5, 1]
    const { updater, states } = setup({ installer })
    await updater.check()

    await updater.install()

    expect(states.map((state) => state.notice).slice(states.length - 6)).toEqual([
      { kind: 'downloading', version: '0.10.0' },
      { kind: 'downloading', version: '0.10.0', percent: 0 },
      { kind: 'downloading', version: '0.10.0', percent: 50 },
      { kind: 'downloading', version: '0.10.0', percent: 100 },
      { kind: 'installing', version: '0.10.0' },
      { kind: 'installed', version: '0.10.0' },
    ])
  })

  it('should refuse and discard the file when its checksum does not match', async () => {
    const { updater, installer, warnings } = setup({ installer: goodInstaller('cd'.repeat(32)) })
    await updater.check()

    await updater.install()

    expect(installer?.installed).toEqual([])
    expect(installer?.discarded).toEqual(['/tmp/update/dev-cockpit_0.10.0_amd64.deb'])
    expect(updater.state().notice).toEqual({
      kind: 'failed',
      version: '0.10.0',
      code: 'DCK-UPD-005',
    })
    expect(warnings).toEqual(['update not installed'])
  })

  it('should fail with no package when the release has none for the processor', async () => {
    const { updater, installer } = setup({ arch: 'ia32' })
    await updater.check()

    await updater.install()

    expect(installer?.installed).toEqual([])
    expect(updater.state().notice).toMatchObject({ kind: 'failed', code: 'DCK-UPD-003' })
  })

  it('should fail with no package when the checksums do not list it', async () => {
    const installer = goodInstaller()
    installer.texts.set(SUMS, ok(`${HASH}  other.deb\n`))
    const { updater } = setup({ installer })
    await updater.check()

    await updater.install()

    expect(updater.state().notice).toMatchObject({ kind: 'failed', code: 'DCK-UPD-003' })
  })

  it('should say the download failed when the package cannot be fetched', async () => {
    const installer = goodInstaller()
    installer.downloads.clear()
    const { updater } = setup({ installer })
    await updater.check()

    await updater.install()

    expect(updater.state().notice).toMatchObject({ kind: 'failed', code: 'DCK-UPD-004' })
    expect(updater.state().offer).toBe('0.10.0')
  })

  it('should offer the update again and not retry by itself when the user cancels the password', async () => {
    const installer = goodInstaller()
    installer.outcome = ok('cancelled')
    const { updater, scheduler, warnings } = setup({ mode: 'install', installer })
    await updater.check()
    await settle()

    scheduler.advance(CHECK_INTERVAL_MS)
    await settle()

    expect(installer.installed).toHaveLength(1)
    expect(updater.state().notice).toEqual({ kind: 'available', version: '0.10.0' })
    expect(warnings).toEqual([])
  })

  it('should only point to the release when the system cannot install', async () => {
    const { updater } = setup({ mode: 'install', installer: null })

    await updater.check()
    await updater.install()
    await settle()

    expect(updater.state().canInstall).toBe(false)
    expect(updater.state().notice).toEqual({ kind: 'available', version: '0.10.0' })
    expect(updater.releasePage()).toBe(PAGE)
  })

  it('should stop checking once installed when the timer fires', async () => {
    const { updater, source, scheduler } = setup({ mode: 'install' })
    await updater.check()
    await settle()

    scheduler.advance(CHECK_INTERVAL_MS)
    await settle()

    expect(source.calls).toBe(1)
    expect(updater.state().notice).toEqual({ kind: 'installed', version: '0.10.0' })
  })

  it('should hide the installed notice for this run when the user dismisses it', async () => {
    const { updater, dismissed } = setup({ mode: 'install' })
    await updater.check()
    await settle()

    updater.dismiss()

    expect(updater.state().notice).toEqual({ kind: 'none' })
    expect(dismissed()).toBeUndefined()
  })
})
