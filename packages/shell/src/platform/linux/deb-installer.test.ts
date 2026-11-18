import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommandResult, createDebInstaller } from './deb-installer.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-updates-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const BASE = 'https://downloads.example.com/v0.10.0'
const NAME = 'dev-cockpit_0.10.0_amd64.deb'
const content = Buffer.from('a package of bytes, '.repeat(500))
const sha256 = createHash('sha256').update(content).digest('hex')

function setup(
  reply: (url: string) => Response | Promise<Response> = () => new Response(content),
  exit: CommandResult = { code: 0, stderr: '' },
) {
  const requests: { url: string; headers: unknown }[] = []
  const commands: (readonly string[])[] = []
  const installer = createDebInstaller({
    fetch: (async (url: string, init?: RequestInit) => {
      requests.push({ url, headers: init?.headers })
      return reply(url)
    }) as unknown as typeof fetch,
    run: async (command, args) => {
      commands.push([command, ...args])
      return exit
    },
    tempRoot: root,
    userAgent: 'dev-cockpit/0.9.0',
    logger: silentLogger,
  })
  return { installer, requests, commands }
}

const codeOf = (result: { ok: boolean; error?: { data?: { code?: string } } }) =>
  result.ok ? undefined : result.error?.data?.code

describe('createDebInstaller download', () => {
  it('should save the package in a private folder and hash it when downloading', async () => {
    const progress: number[] = []
    const { installer, requests } = setup()

    const result = await installer.download(
      { name: NAME, url: `${BASE}/${NAME}`, size: content.length },
      (fraction) => progress.push(fraction),
    )

    expect(result.ok && result.value.sha256).toBe(sha256)
    const file = result.ok ? result.value.file : ''
    expect(dirname(dirname(file))).toBe(root)
    expect(await readFile(file)).toEqual(content)
    expect(progress.at(-1)).toBe(1)
    expect(requests[0]?.headers).toEqual({ 'user-agent': 'dev-cockpit/0.9.0' })
  })

  it('should fail and leave nothing behind when the server refuses the file', async () => {
    const { installer } = setup(() => new Response('gone', { status: 404 }))

    const result = await installer.download(
      { name: NAME, url: `${BASE}/${NAME}`, size: 1 },
      () => {},
    )

    expect(codeOf(result)).toBe('DCK-UPD-004')
    expect(await readdir(root)).toEqual([])
  })

  it('should fail and leave nothing behind when the network drops', async () => {
    const { installer } = setup(() => {
      throw new TypeError('fetch failed')
    })

    const result = await installer.download(
      { name: NAME, url: `${BASE}/${NAME}`, size: 1 },
      () => {},
    )

    expect(codeOf(result)).toBe('DCK-UPD-004')
    expect(await readdir(root)).toEqual([])
  })

  it('should refuse a file name when it could leave the folder', async () => {
    const { installer, requests } = setup()

    const result = await installer.download(
      { name: '../x.deb', url: `${BASE}/x`, size: 1 },
      () => {},
    )

    expect(codeOf(result)).toBe('DCK-UPD-004')
    expect(requests).toEqual([])
  })
})

describe('createDebInstaller readText', () => {
  it('should return the text when the server answers', async () => {
    const { installer } = setup(() => new Response(`${sha256}  ${NAME}\n`))

    expect(await installer.readText(`${BASE}/SHA256SUMS`)).toEqual({
      ok: true,
      value: `${sha256}  ${NAME}\n`,
    })
  })

  it('should fail as a download when the server refuses', async () => {
    const { installer } = setup(() => new Response('', { status: 500 }))

    expect(codeOf(await installer.readText(`${BASE}/SHA256SUMS`))).toBe('DCK-UPD-004')
  })
})

describe('createDebInstaller install', () => {
  async function downloaded(exit: CommandResult) {
    const fake = setup(undefined, exit)
    const result = await fake.installer.download(
      { name: NAME, url: `${BASE}/${NAME}`, size: content.length },
      () => {},
    )
    if (!result.ok) throw new Error('invariant: the fake download succeeds')
    return { ...fake, file: result.value.file }
  }

  it('should install with apt through pkexec when the password is given', async () => {
    const { installer, commands, file } = await downloaded({ code: 0, stderr: '' })

    expect(await installer.install(file)).toEqual({ ok: true, value: 'installed' })
    expect(commands).toEqual([['pkexec', '/usr/bin/apt-get', 'install', '-y', file]])
  })

  it('should report a cancel and not an error when the user dismisses the password dialog', async () => {
    const { installer, file } = await downloaded({ code: 126, stderr: '' })

    expect(await installer.install(file)).toEqual({ ok: true, value: 'cancelled' })
  })

  it('should fail to install when apt or polkit refuses', async () => {
    const { installer, file } = await downloaded({ code: 100, stderr: 'E: broken\n' })

    expect(codeOf(await installer.install(file))).toBe('DCK-UPD-006')
  })

  it('should refuse to install a file when it is not one it downloaded', async () => {
    const { installer, commands } = setup()

    expect(codeOf(await installer.install('/etc/passwd'))).toBe('DCK-UPD-006')
    expect(commands).toEqual([])
  })

  it('should remove the folder when discarding the downloaded file', async () => {
    const { installer, file } = await downloaded({ code: 0, stderr: '' })

    await installer.discard(file)

    expect(existsSync(dirname(file))).toBe(false)
  })
})
