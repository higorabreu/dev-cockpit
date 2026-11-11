import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createComposeInspector, findComposeFile } from './compose-inspector.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-compose-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const touch = async (...parts: string[]) => {
  const path = join(root, ...parts)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, '')
  return path
}

describe('findComposeFile', () => {
  it('should find the compose file in the directory itself when it has one', async () => {
    const file = await touch('app', 'docker-compose.yaml')

    expect(await findComposeFile(join(root, 'app'))).toBe(file)
  })

  it('should find the compose file in a parent directory when the cwd is a subfolder', async () => {
    const file = await touch('app', 'compose.yml')
    await mkdir(join(root, 'app', 'backend', 'src'), { recursive: true })

    expect(await findComposeFile(join(root, 'app', 'backend', 'src'))).toBe(file)
  })

  it('should stop at the given directory when no compose file exists below it', async () => {
    await touch('outside', 'compose.yaml')
    await mkdir(join(root, 'outside', 'home', 'proj'), { recursive: true })

    expect(
      await findComposeFile(join(root, 'outside', 'home', 'proj'), join(root, 'outside', 'home')),
    ).toBeUndefined()
  })

  it('should be undefined when there is no compose file above', async () => {
    await mkdir(join(root, 'empty'), { recursive: true })

    expect(await findComposeFile(join(root, 'empty'), root)).toBeUndefined()
  })
})

describe('createComposeInspector', () => {
  const output = JSON.stringify({
    Service: 'nginx',
    Name: 'n',
    State: 'running',
    Health: '',
    Status: 'Up 1 hour',
  })

  it('should report none when the directory has no compose file', async () => {
    await mkdir(join(root, 'plain'), { recursive: true })
    const inspector = createComposeInspector({ stopAt: root, run: async () => output })

    expect(await inspector.status(join(root, 'plain'))).toEqual({ kind: 'none' })
  })

  it('should report the project name and the containers when docker answers', async () => {
    await touch('shop', 'docker-compose.yaml')
    const inspector = createComposeInspector({ run: async () => output })

    const status = await inspector.status(join(root, 'shop'))

    expect(status).toMatchObject({ kind: 'ok', project: 'shop' })
    expect(status.kind === 'ok' && status.containers.map((c) => c.service)).toEqual(['nginx'])
  })

  it('should report unavailable when docker fails', async () => {
    await touch('shop', 'docker-compose.yaml')
    const inspector = createComposeInspector({ run: async () => undefined })

    expect(await inspector.status(join(root, 'shop'))).toEqual({ kind: 'unavailable' })
  })

  it('should not ask docker again inside the cache window when called twice', async () => {
    await touch('shop', 'docker-compose.yaml')
    let calls = 0
    let now = 0
    const inspector = createComposeInspector({
      now: () => now,
      run: async () => {
        calls += 1
        return output
      },
    })

    await inspector.status(join(root, 'shop'))
    now += 500
    await inspector.status(join(root, 'shop'))
    now += 2000
    await inspector.status(join(root, 'shop'))

    expect(calls).toBe(2)
  })
})
