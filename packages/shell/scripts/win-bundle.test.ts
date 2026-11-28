import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dckCommand, fileVersion, icoFromPngs } from './win-bundle.mjs'

describe('icoFromPngs', () => {
  it('should index each PNG by its side and offset when it builds the icon', () => {
    // Arrange
    const small = Buffer.from('small-png')
    const large = Buffer.from('large-png-data')

    // Act
    const ico = icoFromPngs([
      { size: 48, png: small },
      { size: 256, png: large },
    ])

    // Assert
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2])
    expect([ico.readUInt8(6), ico.readUInt32LE(14), ico.readUInt32LE(18)]).toEqual([48, 9, 38])
    expect([ico.readUInt8(22), ico.readUInt32LE(30), ico.readUInt32LE(34)]).toEqual([0, 14, 47])
    expect(ico.subarray(38).toString()).toBe('small-pnglarge-png-data')
  })
})

describe('fileVersion', () => {
  it.each([
    { version: '0.15.0', expected: '0.15.0.0' },
    { version: '1.2.0-beta.3', expected: '1.2.0.0' },
  ])('should give $expected when the release is $version', ({ version, expected }) => {
    expect(fileVersion(version)).toBe(expected)
  })
})

describe('dckCommand', () => {
  it('should run the CLI inside the packaged Electron with CRLF lines when cmd reads it', () => {
    const command = dckCommand('Dev Cockpit')

    expect(command.split('\r\n')).toEqual([
      '@echo off',
      'setlocal',
      'set ELECTRON_RUN_AS_NODE=1',
      'set DCK_PACKAGED=1',
      '"%~dp0..\\..\\Dev Cockpit.exe" "%~dp0..\\app\\dck.mjs" %*',
      '',
    ])
  })

  it.runIf(process.platform === 'win32')(
    'should hand the CLI its arguments when cmd runs it from a folder with spaces',
    () => {
      // Arrange: node stands in for the packaged Electron and prints what it got
      const root = mkdtempSync(join(tmpdir(), 'dck win '))
      try {
        mkdirSync(join(root, 'resources', 'bin'), { recursive: true })
        mkdirSync(join(root, 'resources', 'app'))
        writeFileSync(
          join(root, 'resources', 'app', 'dck.mjs'),
          'console.log(process.env.ELECTRON_RUN_AS_NODE, process.argv.slice(2).join(" "))',
        )
        writeFileSync(join(root, 'resources', 'bin', 'dck.cmd'), dckCommand('node'))
        copyFileSync(process.execPath, join(root, 'node.exe'))

        // Act: quoted as a user's shell quotes a path with spaces
        const command = join(root, 'resources', 'bin', 'dck.cmd')
        const output = execFileSync('cmd.exe', ['/d', '/s', '/c', `""${command}" ping now"`], {
          encoding: 'utf8',
          windowsVerbatimArguments: true,
        })

        // Assert
        expect(output.trim()).toBe('1 ping now')
      } finally {
        // Windows may hold the copied executable for a moment after it exits
        rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      }
    },
  )
})
