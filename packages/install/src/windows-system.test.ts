import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWindowsSystem, runPowerShell } from './windows-system.ts'

// Each check touches the real system, so they run only on Windows; the PATH one in a test key of its own
describe.runIf(process.platform === 'win32')('createWindowsSystem', () => {
  const testKey = `HKCU:\\Software\\dck-install-test-${process.pid}`
  let root = ''

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dck install '))
  })

  afterEach(async () => {
    await runPowerShell(
      `Remove-Item -Path '${testKey}' -Recurse -Force -ErrorAction SilentlyContinue`,
      {},
    )
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  })

  it('should unpack the folder at the root of a zip when tar reads it', async () => {
    // Arrange
    mkdirSync(join(root, 'source', 'Dev Cockpit'), { recursive: true })
    writeFileSync(join(root, 'source', 'Dev Cockpit', 'Dev Cockpit.exe'), 'app')
    const zip = join(root, 'app.zip')
    const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    execFileSync(tar, ['-a', '-c', '-f', zip, '-C', join(root, 'source'), 'Dev Cockpit'])
    const system = createWindowsSystem()

    // Act
    const unpacked = await system.unpack(zip, join(root, 'into'))

    // Assert
    expect(unpacked).toBe(true)
    expect(await system.exists(join(root, 'into', 'Dev Cockpit', 'Dev Cockpit.exe'))).toBe(true)
  })

  it("should add the folder once and keep the other entries' variables when the PATH is changed", async () => {
    // Arrange
    await runPowerShell(
      `New-Item -Path '${testKey}' -Force | Out-Null; New-ItemProperty -Path '${testKey}' -Name Path -PropertyType ExpandString -Value '%USERPROFILE%\\bin;' | Out-Null`,
      {},
    )
    const system = createWindowsSystem(testKey)
    const bin = join(root, "ana's tools", 'bin')

    // Act
    const first = await system.addToUserPath(bin)
    const second = await system.addToUserPath(`${bin}\\`)
    const read = await runPowerShell(
      `$item = Get-Item '${testKey}'; $item.GetValueKind('Path'); $item.GetValue('Path', '', 'DoNotExpandEnvironmentNames')`,
      {},
    )

    // Assert
    expect([first, second]).toEqual(['added', 'present'])
    expect(read.stdout.split(/\r?\n/)).toEqual(['ExpandString', `%USERPROFILE%\\bin;${bin}`])
  }, 30_000)

  it('should create a Start menu shortcut to the app when its folder does not exist yet', async () => {
    const system = createWindowsSystem()
    const link = join(root, 'Start Menu', 'Programs', 'Dev Cockpit.lnk')

    const created = await system.shortcut(link, process.execPath)

    expect(created).toBe(true)
    expect(await system.exists(link)).toBe(true)
  })

  it('should stop only the programs run from the app folder when the cockpit is replaced', async () => {
    // Arrange: a copy of node stands in for the running cockpit
    const app = join(root, 'Dev Cockpit')
    mkdirSync(app)
    copyFileSync(process.execPath, join(app, 'Dev Cockpit.exe'))
    const running = spawn(join(app, 'Dev Cockpit.exe'), ['-e', 'setTimeout(() => {}, 60000)'])
    await new Promise((resolve) => setTimeout(resolve, 500))
    const exited = new Promise((resolve) => running.once('exit', () => resolve(true)))
    const system = createWindowsSystem()

    // Act
    const stopped = await system.stopRunning(app)

    // Assert
    expect(stopped).toBe(1)
    expect(await exited).toBe(true)
    expect(await system.stopRunning(app)).toBe(0)
  }, 30_000)
})
