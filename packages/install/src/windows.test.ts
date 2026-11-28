import { describe, expect, it } from 'vitest'
import { createWindowsTarget, type PathChange, type WindowsSystem } from './windows.ts'

const LOCAL = 'C:\\Users\\ana\\AppData\\Local'
const ROAMING = 'C:\\Users\\ana\\AppData\\Roaming'
const APP = `${LOCAL}\\Programs\\Dev Cockpit`
const STAGING = `${LOCAL}\\Programs\\.Dev Cockpit.new`
const OLD = `${LOCAL}\\Programs\\.Dev Cockpit.old`
const ZIP = 'C:\\Temp\\dev-cockpit-install-1\\dev-cockpit_0.16.0_win32-x64.zip'

interface FakeOptions {
  readonly installed?: string
  readonly running?: number
  readonly unpacks?: boolean
  readonly zipHasApp?: boolean
  readonly locked?: boolean
  readonly path?: PathChange
}

// Keeps the folders that exist and records every step, so the order and the paths can be checked
function fakeSystem(options: FakeOptions = {}) {
  const folders = new Set<string>(options.installed ? [APP] : [])
  const steps: string[] = []
  const system: WindowsSystem = {
    readText: async (path) =>
      options.installed && path === `${APP}\\resources\\app\\package.json`
        ? JSON.stringify({ name: 'dev-cockpit', version: options.installed })
        : undefined,
    exists: async (path) =>
      folders.has(path) ||
      (path === `${STAGING}\\Dev Cockpit\\Dev Cockpit.exe` &&
        folders.has(`${STAGING}\\Dev Cockpit`)),
    remove: async (path) => {
      if (folders.has(path)) steps.push(`remove ${path}`)
      folders.delete(path)
      for (const folder of folders) if (folder.startsWith(`${path}\\`)) folders.delete(folder)
      return true
    },
    rename: async (from, to) => {
      if (options.locked && from === APP) return false
      steps.push(`rename ${from} -> ${to}`)
      folders.delete(from)
      folders.add(to)
      return true
    },
    mkdir: async () => undefined,
    stopRunning: async (folder) => {
      steps.push(`stop ${folder}`)
      return options.running ?? 0
    },
    unpack: async (zip, into) => {
      steps.push(`unpack ${zip} -> ${into}`)
      if (options.unpacks === false) return false
      folders.add(into)
      if (options.zipHasApp !== false) folders.add(`${into}\\Dev Cockpit`)
      return true
    },
    shortcut: async (link, target) => {
      steps.push(`shortcut ${link} -> ${target}`)
      return true
    },
    addToUserPath: async (folder) => {
      steps.push(`path ${folder}`)
      return options.path ?? 'added'
    },
  }
  return { system, steps, folders }
}

const targetFor = (system: WindowsSystem, lines: string[] = []) =>
  createWindowsTarget({
    system,
    localAppData: LOCAL,
    appData: ROAMING,
    out: (line) => void lines.push(line),
  })

describe('createWindowsTarget', () => {
  it('should name the x64 zip when the release is listed', () => {
    const { system } = fakeSystem()

    expect(targetFor(system).packageName('0.16.0')).toBe('dev-cockpit_0.16.0_win32-x64.zip')
  })

  it("should read the installed version from the app's manifest when it is installed", async () => {
    const installed = targetFor(fakeSystem({ installed: '0.15.0' }).system)
    const missing = targetFor(fakeSystem().system)

    expect(await installed.installedVersion()).toBe('0.15.0')
    expect(await missing.installedVersion()).toBeUndefined()
  })

  it('should unpack beside the app, add the Start menu entry and put dck on the PATH when it installs fresh', async () => {
    // Arrange
    const { system, steps, folders } = fakeSystem()
    const lines: string[] = []

    // Act
    const result = await targetFor(system, lines).install({
      file: ZIP,
      version: '0.16.0',
      downgrade: false,
    })

    // Assert
    expect(result.ok).toBe(true)
    expect(steps).toEqual([
      `unpack ${ZIP} -> ${STAGING}`,
      `stop ${APP}`,
      `rename ${STAGING}\\Dev Cockpit -> ${APP}`,
      `remove ${STAGING}`,
      `shortcut ${ROAMING}\\Microsoft\\Windows\\Start Menu\\Programs\\Dev Cockpit.lnk -> ${APP}\\Dev Cockpit.exe`,
      `path ${APP}\\resources\\bin`,
    ])
    expect([...folders]).toEqual([APP])
    expect(lines).toContain('Added the dck command to your PATH; open a new terminal to use it.')
  })

  it('should stop the running cockpit and swap the folders when an older one is installed', async () => {
    // Arrange
    const { system, steps } = fakeSystem({ installed: '0.15.0', running: 2, path: 'present' })
    const lines: string[] = []

    // Act
    const result = await targetFor(system, lines).install({
      file: ZIP,
      version: '0.16.0',
      downgrade: false,
    })

    // Assert
    expect(result.ok).toBe(true)
    expect(steps.slice(1, 5)).toEqual([
      `stop ${APP}`,
      `rename ${APP} -> ${OLD}`,
      `rename ${STAGING}\\Dev Cockpit -> ${APP}`,
      `remove ${OLD}`,
    ])
    expect(lines).toContain('Closed the running Dev Cockpit to replace it.')
    expect(lines).toContain('The dck command is ready.')
  })

  it('should keep the old app and clean the staging folder when the old folder cannot be moved', async () => {
    // Arrange
    const { system, folders } = fakeSystem({ installed: '0.15.0', locked: true })

    // Act
    const result = await targetFor(system).install({
      file: ZIP,
      version: '0.16.0',
      downgrade: false,
    })

    // Assert
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error.message).toContain('close Dev Cockpit and try again')
    expect([...folders]).toEqual([APP])
  })

  it.each([
    { when: 'the zip cannot be unpacked', options: { unpacks: false }, detail: 'could not unpack' },
    { when: 'the zip holds no app', options: { zipHasApp: false }, detail: 'no app in the zip' },
  ])('should fail before touching the installed app when $when', async ({ options, detail }) => {
    // Arrange
    const { system, steps, folders } = fakeSystem({ ...options, installed: '0.15.0' })

    // Act
    const result = await targetFor(system).install({
      file: ZIP,
      version: '0.16.0',
      downgrade: false,
    })

    // Assert
    expect(result.ok ? '' : result.error.message).toContain(detail)
    expect(steps.some((step) => step.startsWith('stop'))).toBe(false)
    expect([...folders]).toEqual([APP])
  })

  it('should tell where dck is when the PATH cannot be changed', async () => {
    const lines: string[] = []

    await targetFor(fakeSystem({ path: 'failed' }).system, lines).install({
      file: ZIP,
      version: '0.16.0',
      downgrade: false,
    })

    expect(lines).toContain(`To use the dck command, add ${APP}\\resources\\bin to your PATH.`)
  })
})
