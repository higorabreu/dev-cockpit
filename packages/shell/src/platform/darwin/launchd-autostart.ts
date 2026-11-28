import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
// This system's paths are POSIX, so they are joined the same when a test runs on Windows
import { join } from 'node:path/posix'
import type { Autostart } from '@dck/core'

export interface LaunchdAutostartConfig {
  // Normally ~/Library/LaunchAgents
  readonly directory: string
  // The job's reverse DNS name, which is also the file's name
  readonly label: string
  readonly command: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const xmlString = (text: string) => `<string>${escapeXml(text)}</string>`

export function launchAgentPlist(config: LaunchdAutostartConfig): string {
  const env = Object.entries(config.env ?? {})
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  ${xmlString(config.label)}`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...config.command.map((part) => `    ${xmlString(part)}`),
    '  </array>',
    ...(env.length === 0
      ? []
      : [
          '  <key>EnvironmentVariables</key>',
          '  <dict>',
          ...env.flatMap(([key, value]) => [
            `    <key>${escapeXml(key)}</key>`,
            `    ${xmlString(value)}`,
          ]),
          '  </dict>',
        ]),
    '  <key>RunAtLoad</key>',
    '  <true/>',
    // Only in the graphical login: a session over ssh has no screen for the window
    '  <key>LimitLoadToSessionType</key>',
    '  <string>Aqua</string>',
    // The resource limits of an app, not of a background job: the hotkey must show the window at once
    '  <key>ProcessType</key>',
    '  <string>Interactive</string>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n')
}

// A LaunchAgent and not app.setLoginItemSettings, whose behavior changed in macOS 13: a file is testable
export function createLaunchdAutostart(config: LaunchdAutostartConfig): Autostart {
  const file = join(config.directory, `${config.label}.plist`)
  return {
    isEnabled: () =>
      access(file).then(
        () => true,
        () => false,
      ),
    async setEnabled(enabled) {
      if (!enabled) {
        await rm(file, { force: true })
        return
      }
      await mkdir(config.directory, { recursive: true })
      // launchd reads the folder at login: a half-written file there would be a broken job
      const temporary = `${file}.tmp`
      await writeFile(temporary, launchAgentPlist(config))
      await rename(temporary, file)
    },
  }
}
