import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bundleVersion, dckWrapper } from './mac-bundle.mjs'

let root = ''
let resources = ''
let tools = ''

// A bundle whose executable prints what the wrapper hands it, with a space in the names as in the real one
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'dck-bundle-')))
  const contents = join(root, 'Dev Cockpit.app', 'Contents')
  resources = join(contents, 'Resources')
  mkdirSync(join(contents, 'MacOS'), { recursive: true })
  mkdirSync(join(resources, 'bin'), { recursive: true })
  writeFileSync(
    join(contents, 'MacOS', 'Dev Cockpit'),
    '#!/bin/sh\necho "$ELECTRON_RUN_AS_NODE $DCK_PACKAGED $*"\n',
    { mode: 0o755 },
  )
  writeFileSync(join(resources, 'bin', 'dck'), dckWrapper('Dev Cockpit'), { mode: 0o755 })
  // Only the commands macOS 12 has: no realpath
  tools = join(root, 'tools')
  mkdirSync(tools)
  for (const tool of ['dirname', 'readlink', 'env']) {
    const system = ['/usr/bin', '/bin'].map((folder) => join(folder, tool)).find(existsSync)
    if (system) symlinkSync(system, join(tools, tool))
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('dckWrapper', () => {
  it.each([
    { when: 'it is run from the bundle', link: () => join(resources, 'bin', 'dck') },
    {
      when: 'it is run through an absolute link',
      link: () => {
        mkdirSync(join(root, 'usr local', 'bin'), { recursive: true })
        symlinkSync(join(resources, 'bin', 'dck'), join(root, 'usr local', 'bin', 'dck'))
        return join(root, 'usr local', 'bin', 'dck')
      },
    },
    {
      when: 'it is run through a chain of relative links',
      link: () => {
        mkdirSync(join(root, 'usr local', 'bin'), { recursive: true })
        mkdirSync(join(root, 'home', 'bin'), { recursive: true })
        symlinkSync(
          '../../Dev Cockpit.app/Contents/Resources/bin/dck',
          join(root, 'usr local', 'bin', 'dck'),
        )
        symlinkSync('../../usr local/bin/dck', join(root, 'home', 'bin', 'dck'))
        return join(root, 'home', 'bin', 'dck')
      },
    },
  ])(
    'should run the bundle CLI inside the packaged Electron without realpath when $when',
    ({ link }) => {
      // Arrange
      const command = link()

      // Act
      const output = execFileSync(command, ['ping'], { encoding: 'utf8', env: { PATH: tools } })

      // Assert
      expect(output).toBe(`1 1 ${join(resources, 'bin')}/../dck.mjs ping\n`)
    },
  )
})

describe('bundleVersion', () => {
  it.each([
    { version: '0.4.0', expected: '0.4.0', when: 'it is a release' },
    { version: '1.2.0-beta.3', expected: '1.2.0', when: 'it is a prerelease' },
    { version: '1.2.0+abc', expected: '1.2.0', when: 'it carries build metadata' },
  ])('should give the bundle only integers when $when', ({ version, expected }) => {
    // Act
    const bundle = bundleVersion(version)

    // Assert
    expect(bundle).toBe(expected)
  })

  it('should refuse the version when it has no integers to give', () => {
    // Act
    const read = () => bundleVersion('next')

    // Assert
    expect(read).toThrow('version next has no x.y.z for the bundle')
  })
})
