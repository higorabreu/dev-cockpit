import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureSpawnHelperExecutable } from './spawn-helper.ts'

let packageDir: string

beforeEach(async () => {
  packageDir = await mkdtemp(join(tmpdir(), 'dck-pty-'))
})

afterEach(async () => {
  await rm(packageDir, { recursive: true, force: true })
})

const helper = async (relative: string, mode: number) => {
  const file = join(packageDir, relative)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, '')
  await chmod(file, mode)
  return file
}

describe('ensureSpawnHelperExecutable', () => {
  it('should make a prebuilt helper executable when it ships without the execute bit', async () => {
    const file = await helper('prebuilds/darwin-arm64/spawn-helper', 0o644)

    const fixed = await ensureSpawnHelperExecutable(packageDir)

    expect(fixed).toEqual([file])
    expect((await stat(file)).mode & 0o777).toBe(0o755)
  })

  it('should fix the compiled helper too when the package was built from source', async () => {
    const file = await helper('build/Release/spawn-helper', 0o644)

    const fixed = await ensureSpawnHelperExecutable(packageDir)

    expect(fixed).toEqual([file])
  })

  it('should leave a helper alone when it is already executable', async () => {
    await helper('prebuilds/darwin-x64/spawn-helper', 0o755)

    const fixed = await ensureSpawnHelperExecutable(packageDir)

    expect(fixed).toEqual([])
  })

  it('should do nothing when the package has no helper at all', async () => {
    const fixed = await ensureSpawnHelperExecutable(packageDir)

    expect(fixed).toEqual([])
  })
})
