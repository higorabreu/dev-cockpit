import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReleaseDownload } from './release-download.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-downloads-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const BASE = 'https://downloads.example.com/v0.10.0'
const NAME = 'dev-cockpit_0.10.0_amd64.deb'
const content = Buffer.from('a package of bytes, '.repeat(500))
const sha256 = createHash('sha256').update(content).digest('hex')

function setup(reply: (url: string) => Response | Promise<Response> = () => new Response(content)) {
  const requests: { url: string; headers: unknown }[] = []
  const files = createReleaseDownload({
    fetch: (async (url: string, init?: RequestInit) => {
      requests.push({ url, headers: init?.headers })
      return reply(url)
    }) as unknown as typeof fetch,
    tempRoot: root,
    folderPrefix: 'dev-cockpit-test-',
    userAgent: 'dev-cockpit/0.9.0',
    logger: silentLogger,
  })
  return { files, requests }
}

const codeOf = (result: { ok: boolean; error?: { data?: { code?: string } } }) =>
  result.ok ? undefined : result.error?.data?.code

describe('createReleaseDownload download', () => {
  it('should save the package in a private folder and hash it when downloading', async () => {
    const progress: number[] = []
    const { files, requests } = setup()

    const result = await files.download(
      { name: NAME, url: `${BASE}/${NAME}`, size: content.length },
      (fraction) => progress.push(fraction),
    )

    expect(result.ok && result.value.sha256).toBe(sha256)
    const file = result.ok ? result.value.file : ''
    expect(dirname(dirname(file))).toBe(root)
    expect(files.owns(file)).toBe(true)
    expect(await readFile(file)).toEqual(content)
    expect(progress.at(-1)).toBe(1)
    expect(requests[0]?.headers).toEqual({ 'user-agent': 'dev-cockpit/0.9.0' })
  })

  it('should fail and leave nothing behind when the server refuses the file', async () => {
    const { files } = setup(() => new Response('gone', { status: 404 }))

    const result = await files.download({ name: NAME, url: `${BASE}/${NAME}`, size: 1 }, () => {})

    expect(codeOf(result)).toBe('DCK-UPD-004')
    expect(await readdir(root)).toEqual([])
  })

  it('should fail and leave nothing behind when the network drops', async () => {
    const { files } = setup(() => {
      throw new TypeError('fetch failed')
    })

    const result = await files.download({ name: NAME, url: `${BASE}/${NAME}`, size: 1 }, () => {})

    expect(codeOf(result)).toBe('DCK-UPD-004')
    expect(await readdir(root)).toEqual([])
  })

  it('should refuse a file name when it could leave the folder', async () => {
    const { files, requests } = setup()

    const result = await files.download({ name: '../x.deb', url: `${BASE}/x`, size: 1 }, () => {})

    expect(codeOf(result)).toBe('DCK-UPD-004')
    expect(requests).toEqual([])
  })
})

describe('createReleaseDownload readText', () => {
  it('should return the text when the server answers', async () => {
    const { files } = setup(() => new Response(`${sha256}  ${NAME}\n`))

    expect(await files.readText(`${BASE}/SHA256SUMS`)).toEqual({
      ok: true,
      value: `${sha256}  ${NAME}\n`,
    })
  })

  it('should fail as a download when the server refuses', async () => {
    const { files } = setup(() => new Response('', { status: 500 }))

    expect(codeOf(await files.readText(`${BASE}/SHA256SUMS`))).toBe('DCK-UPD-004')
  })
})

describe('createReleaseDownload discard', () => {
  it('should remove the folder when discarding a downloaded file', async () => {
    const { files } = setup()
    const result = await files.download(
      { name: NAME, url: `${BASE}/${NAME}`, size: content.length },
      () => {},
    )
    const file = result.ok ? result.value.file : ''

    await files.discard(file)

    expect(existsSync(dirname(file))).toBe(false)
  })

  it('should not own or remove a file when it lies outside its folders', async () => {
    const { files } = setup()

    // A file that exists on every system and lies outside the download folders
    const outside = process.execPath

    await files.discard(outside)

    expect(files.owns(outside)).toBe(false)
    expect(existsSync(outside)).toBe(true)
  })
})
