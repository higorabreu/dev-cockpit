import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandRunner, hasCommand, macFiles } from './node-system.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-install-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

describe('hasCommand', () => {
  it('should find a program when an executable with its name is in a PATH folder', async () => {
    await writeFile(join(root, 'apt'), '#!/bin/sh\n')
    await chmod(join(root, 'apt'), 0o755)

    expect(await hasCommand('apt', ['/nonexistent', root].join(delimiter))).toBe(true)
    expect(await hasCommand('dpkg-query', root)).toBe(false)
  })
})

// Creates a symbolic link, which Windows only allows in Developer Mode or as an administrator
describe.skipIf(process.platform === 'win32')('macFiles', () => {
  it('should tell a missing path, a link and another file apart', async () => {
    await writeFile(join(root, 'dck'), '')
    await symlink('/Applications/Dev Cockpit.app/Contents/Resources/bin/dck', join(root, 'link'))

    expect(await macFiles.linkState(join(root, 'none'))).toEqual({ kind: 'missing' })
    expect(await macFiles.linkState(join(root, 'dck'))).toEqual({ kind: 'other' })
    expect(await macFiles.linkState(join(root, 'link'))).toEqual({
      kind: 'link',
      target: '/Applications/Dev Cockpit.app/Contents/Resources/bin/dck',
    })
  })

  it('should read nothing when the file is missing', async () => {
    expect(await macFiles.readText(join(root, 'package.json'))).toBeUndefined()
  })
})

describe('commandRunner', () => {
  it('should return the exit code and the output when capturing a program', async () => {
    expect(
      await commandRunner.capture(process.execPath, ['-e', 'process.stdout.write("hi")']),
    ).toEqual({ code: 0, stdout: 'hi' })
    expect((await commandRunner.capture(process.execPath, ['-e', 'process.exit(3)'])).code).toBe(3)
  })

  it('should return no exit code when the program does not exist', async () => {
    expect(await commandRunner.interactive(join(root, 'missing'), [])).toBeNull()
  })
})
