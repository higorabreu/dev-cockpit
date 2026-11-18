import { errorCodeOf } from '../errors.ts'
import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import type { Cancel, Scheduler } from '../ports/clock.ts'
import type { Logger } from '../ports/logger.ts'
import type { Release, ReleaseSource, UpdateInstaller } from '../ports/updates.ts'
import { parseChecksums, releaseFiles } from './release-files.ts'
import { compareSemver, isNewerVersion, parseSemver } from './semver.ts'

export const UPDATE_MODES = ['off', 'notify', 'install'] as const
export type UpdateMode = (typeof UPDATE_MODES)[number]

export const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000

// The last check, for the line beside "Check now"
export type UpdateCheck =
  | { readonly kind: 'never' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'current' }
  | { readonly kind: 'available'; readonly version: string }
  | { readonly kind: 'failed'; readonly code: string }

// What the tab bar shows; `none` also when the user dismissed it
export type UpdateNotice =
  | { readonly kind: 'none' }
  | { readonly kind: 'available'; readonly version: string }
  // Percent while the size is known
  | { readonly kind: 'downloading'; readonly version: string; readonly percent?: number }
  | { readonly kind: 'installing'; readonly version: string }
  | { readonly kind: 'installed'; readonly version: string }
  | { readonly kind: 'failed'; readonly version: string; readonly code: string }

export interface UpdateState {
  // Linux with the packaged app: the cockpit can install the release; elsewhere it only points to it
  readonly canInstall: boolean
  readonly check: UpdateCheck
  readonly notice: UpdateNotice
  // A newer release that can still be taken, for the hold menu, dismissed or not
  readonly offer?: string
}

export interface UpdaterDeps {
  readonly source: ReleaseSource
  // Undefined where the cockpit cannot install by itself
  readonly installer: UpdateInstaller | undefined
  readonly currentVersion: string
  // Node's name for the processor (x64, arm64)
  readonly arch: string
  mode(): UpdateMode
  readonly scheduler: Scheduler
  // The version whose notice the user dismissed; a newer one shows again
  readonly dismissed: { get(): string | undefined; set(version: string): void }
  readonly logger: Logger
  onChange(state: UpdateState): void
}

export function createUpdater(deps: UpdaterDeps) {
  const { logger } = deps
  const canInstall = deps.installer !== undefined
  let check: UpdateCheck = { kind: 'never' }
  let notice: UpdateNotice = { kind: 'none' }
  // The installed or failed notice the user closed, until the next one
  let hidden = false
  let release: Release | undefined
  let running: Promise<UpdateState> | undefined
  let installing = false
  let cancelTimer: Cancel | undefined
  // A version whose install the user cancelled or that failed is not retried by itself in this run
  const notAgain = new Set<string>()

  const isDismissed = (version: string) => {
    const dismissed = parseSemver(deps.dismissed.get() ?? '')
    const shown = parseSemver(version)
    return dismissed !== undefined && shown !== undefined && compareSemver(shown, dismissed) <= 0
  }

  function visibleNotice(): UpdateNotice {
    if (hidden) return { kind: 'none' }
    if (notice.kind === 'available' && isDismissed(notice.version)) return { kind: 'none' }
    return notice
  }

  function state(): UpdateState {
    const takeable = notice.kind === 'available' || notice.kind === 'failed'
    return {
      canInstall,
      check,
      notice: visibleNotice(),
      ...(release && takeable ? { offer: release.version } : {}),
    }
  }

  const emit = () => deps.onChange(state())

  function show(next: UpdateNotice) {
    notice = next
    hidden = false
    emit()
  }

  function schedule() {
    cancelTimer?.()
    cancelTimer = deps.scheduler.after(CHECK_INTERVAL_MS, () => void runCheck())
  }

  // Past the download, a check has nothing to change until the app restarts
  const settled = () => installing || notice.kind === 'installed'

  async function runCheck(): Promise<UpdateState> {
    if (deps.mode() === 'off' || settled()) return state()
    if (running) return running
    running = (async () => {
      check = { kind: 'checking' }
      emit()
      const latest = await deps.source.latest()
      // Turned off while the answer was on its way: the answer is dropped
      if (deps.mode() === 'off') {
        check = { kind: 'never' }
        return state()
      }
      schedule()
      if (!latest.ok) {
        check = { kind: 'failed', code: errorCodeOf(latest.error) }
        logger.warn('update check failed', { error: latest.error.message })
        emit()
        return state()
      }
      const found = latest.value
      if (!found || !isNewerVersion(found.version, deps.currentVersion)) {
        release = undefined
        check = { kind: 'current' }
        if (notice.kind === 'available' || notice.kind === 'failed') notice = { kind: 'none' }
        emit()
        return state()
      }
      const known = release?.version === found.version
      release = found
      check = { kind: 'available', version: found.version }
      // The notice of an install that failed for this same version stays until the user acts on it
      if (!(known && notice.kind === 'failed')) {
        if (!known) logger.info('update available', { version: found.version })
        notice = { kind: 'available', version: found.version }
        hidden = false
      }
      emit()
      if (deps.mode() === 'install' && canInstall && !notAgain.has(found.version)) void install()
      return state()
    })()
    try {
      return await running
    } finally {
      running = undefined
    }
  }

  function failInstall(version: string, error: ErrorBody) {
    notAgain.add(version)
    logger.warn('update not installed', { version, error: error.message })
    show({ kind: 'failed', version, code: errorCodeOf(error) })
  }

  async function install(): Promise<void> {
    const { installer } = deps
    if (!installer || !release || installing || notice.kind === 'installed') return
    const target = release
    const files = releaseFiles(target, deps.arch)
    if (!files) return failInstall(target.version, errorBody('DCK-UPD-003', deps.arch))
    installing = true
    try {
      show({ kind: 'downloading', version: target.version })
      const sums = await installer.readText(files.checksums.url)
      if (!sums.ok) return failInstall(target.version, sums.error)
      const expected = parseChecksums(sums.value).get(files.package.name)
      if (!expected) return failInstall(target.version, errorBody('DCK-UPD-003', 'no checksum'))
      let shown = -1
      const downloaded = await installer.download(files.package, (fraction) => {
        const percent = Math.max(0, Math.min(100, Math.floor(fraction * 100)))
        if (percent === shown) return
        shown = percent
        show({ kind: 'downloading', version: target.version, percent })
      })
      if (!downloaded.ok) return failInstall(target.version, downloaded.error)
      const { file, sha256 } = downloaded.value
      if (sha256.toLowerCase() !== expected) {
        await installer.discard(file)
        return failInstall(
          target.version,
          errorBody('DCK-UPD-005', `${files.package.name} expected ${expected} got ${sha256}`),
        )
      }
      show({ kind: 'installing', version: target.version })
      const outcome = await installer.install(file)
      await installer.discard(file)
      if (!outcome.ok) return failInstall(target.version, outcome.error)
      if (outcome.value === 'cancelled') {
        notAgain.add(target.version)
        logger.info('update install cancelled', { version: target.version })
        return show({ kind: 'available', version: target.version })
      }
      logger.info('update installed', { version: target.version })
      show({ kind: 'installed', version: target.version })
    } finally {
      installing = false
    }
  }

  return {
    state,
    // On start; checks at once unless the setting is off
    start: () => void runCheck(),
    check: runCheck,
    install,
    // The release page, opened by the host: the window never names an address
    releasePage: () => release?.page,
    dismiss() {
      if (notice.kind === 'available') deps.dismissed.set(notice.version)
      else hidden = true
      emit()
    },
    // Off forgets what was found and stops the timer; on checks at once
    modeChanged() {
      if (deps.mode() !== 'off') {
        void runCheck()
        return
      }
      cancelTimer?.()
      cancelTimer = undefined
      check = { kind: 'never' }
      if (!settled()) {
        release = undefined
        notice = { kind: 'none' }
      }
      emit()
    },
    stop() {
      cancelTimer?.()
      cancelTimer = undefined
    },
  }
}

export type Updater = ReturnType<typeof createUpdater>
