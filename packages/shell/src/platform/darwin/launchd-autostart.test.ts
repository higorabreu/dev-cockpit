import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLaunchdAutostart, launchAgentPlist } from './launchd-autostart.ts'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-launchd-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const config = () => ({
  directory: join(directory, 'LaunchAgents'),
  label: 'io.github.devcockpit',
  command: ['/Applications/Dev Cockpit.app/Contents/MacOS/Dev Cockpit'],
  env: { DCK_START_HIDDEN: '1' },
})

const plistFile = () => join(directory, 'LaunchAgents', 'io.github.devcockpit.plist')

describe('launchAgentPlist', () => {
  it('should run the command at login with the environment when building the job', () => {
    // Act
    const text = launchAgentPlist(config())

    // Assert
    expect(text).toContain('<key>Label</key>\n  <string>io.github.devcockpit</string>')
    expect(text).toContain(
      '<array>\n    <string>/Applications/Dev Cockpit.app/Contents/MacOS/Dev Cockpit</string>\n  </array>',
    )
    expect(text).toContain('<key>DCK_START_HIDDEN</key>\n    <string>1</string>')
    expect(text).toContain('<key>RunAtLoad</key>\n  <true/>')
    expect(text).toContain('<key>LimitLoadToSessionType</key>\n  <string>Aqua</string>')
  })

  it('should escape the XML characters when a path has them', () => {
    // Act
    const text = launchAgentPlist({ ...config(), command: ['/Users/ana/R&D <apps>/dck'] })

    // Assert
    expect(text).toContain('<string>/Users/ana/R&amp;D &lt;apps&gt;/dck</string>')
  })

  it('should leave the environment out when there are no variables', () => {
    // Act
    const text = launchAgentPlist({ ...config(), env: {} })

    // Assert
    expect(text).not.toContain('EnvironmentVariables')
  })
})

describe('createLaunchdAutostart', () => {
  it('should be disabled when no job file exists', async () => {
    expect(await createLaunchdAutostart(config()).isEnabled()).toBe(false)
  })

  it('should write the job and report enabled when enabling', async () => {
    // Arrange
    const autostart = createLaunchdAutostart(config())

    // Act
    await autostart.setEnabled(true)

    // Assert
    expect(await autostart.isEnabled()).toBe(true)
    expect(await readFile(plistFile(), 'utf8')).toBe(launchAgentPlist(config()))
    expect(await readdir(join(directory, 'LaunchAgents'))).toEqual(['io.github.devcockpit.plist'])
  })

  it('should delete the job and report disabled when disabling', async () => {
    // Arrange
    const autostart = createLaunchdAutostart(config())
    await autostart.setEnabled(true)

    // Act
    await autostart.setEnabled(false)

    // Assert
    expect(await autostart.isEnabled()).toBe(false)
  })

  it('should not fail when disabling something that was never enabled', async () => {
    await expect(createLaunchdAutostart(config()).setEnabled(false)).resolves.toBeUndefined()
  })
})
