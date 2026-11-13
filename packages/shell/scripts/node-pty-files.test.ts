import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shipsNodePtyFile } from './node-pty-files.mjs'

describe('shipsNodePtyFile', () => {
  it.each([
    '',
    'package.json',
    'LICENSE',
    'build',
    join('build', 'Release'),
    join('build', 'Release', 'pty.node'),
    join('build', 'Release', 'spawn-helper'),
    'lib',
    join('lib', 'index.js'),
    join('lib', 'worker', 'conoutSocketWorker.js'),
  ])('should ship %s when the app may load it', (path) => {
    // Act
    const shipped = shipsNodePtyFile(path)

    // Assert
    expect(shipped).toBe(true)
  })

  it.each([
    join('build', 'Makefile'),
    join('build', 'config.gypi'),
    join('build', 'pty.target.mk'),
    join('build', 'Release', '.deps'),
    join('build', 'Release', 'obj.target'),
    join('build', 'Release', 'node-addon-api'),
    'node-addon-api',
    'node-addon-api@7.1.1',
    join('prebuilds', 'darwin-arm64', 'pty.node'),
    'src',
    'deps',
    'third_party',
    'binding.gyp',
    'README.md',
    'typings',
    join('lib', 'unixTerminal.test.js'),
  ])('should leave %s out when only the build or the tests use it', (path) => {
    // Act
    const shipped = shipsNodePtyFile(path)

    // Assert
    expect(shipped).toBe(false)
  })
})
