import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UNKNOWN_FOREGROUND } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createProcessInspector,
  parseForegroundGroup,
  parseStartTime,
} from './process-inspector.ts'

describe('parseForegroundGroup', () => {
  it('should read the foreground group when the stat line is regular', () => {
    expect(parseForegroundGroup('100 (zsh) S 1 100 100 34816 4242 4194304 1 2')).toBe(4242)
  })

  it('should survive a process name with spaces and parentheses when parsing', () => {
    expect(parseForegroundGroup('100 (my (weird) name) S 1 100 100 34816 777 0')).toBe(777)
  })

  it('should be undefined when there is no foreground group', () => {
    expect(parseForegroundGroup('100 (zsh) S 1 100 100 0 -1 0')).toBeUndefined()
  })

  it('should be undefined when the line is garbage', () => {
    expect(parseForegroundGroup('garbage')).toBeUndefined()
  })
})

let proc = ''

beforeEach(async () => {
  proc = await mkdtemp(join(tmpdir(), 'dck-proc-'))
})

afterEach(() => rm(proc, { recursive: true, force: true }))

async function fakeProcess(pid: number, cwd: string, stat: string) {
  await mkdir(join(proc, String(pid)), { recursive: true })
  await symlink(cwd, join(proc, String(pid), 'cwd'))
  await writeFile(join(proc, String(pid), 'stat'), stat)
}

describe('createProcessInspector', () => {
  it('should report the working directory and the foreground process name when inspecting', async () => {
    await fakeProcess(10, '/work/project', '10 (zsh) S 1 10 10 1 20 0')
    await mkdir(join(proc, '20'), { recursive: true })
    await writeFile(join(proc, '20', 'comm'), 'claude\n')

    const info = await createProcessInspector(proc).inspect(10)

    expect(info).toMatchObject({ cwd: '/work/project', foreground: 'claude', foregroundPid: 20 })
  })

  it('should be undefined when the process does not exist', async () => {
    expect(await createProcessInspector(proc).inspect(999)).toBeUndefined()
  })

  it('should report an unknown foreground when the foreground group has no name', async () => {
    await fakeProcess(10, '/work', '10 (zsh) S 1 10 10 1 -1 0')

    const info = await createProcessInspector(proc).inspect(10)

    expect(info?.foreground).toBe(UNKNOWN_FOREGROUND)
  })
})

describe('parseStartTime', () => {
  const stat = '10 (zsh) S 1 10 10 1 20 0 0 0 0 0 0 0 0 0 20 0 1 0 9383108 100 200'

  it('should read the start time when the stat line is regular', () => {
    expect(parseStartTime(stat)).toBe('9383108')
  })

  it('should survive a process name with parentheses when reading the start time', () => {
    expect(parseStartTime(stat.replace('(zsh)', '(my (odd) one)'))).toBe('9383108')
  })

  it('should be undefined when the line is too short', () => {
    expect(parseStartTime('10 (zsh) S 1')).toBeUndefined()
  })
})
