import { type FileChange, hostChannels, silentLogger } from '@dck/core'
import { MemoryFileStore } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import type { IpcMainApi } from '../electron/host-bridge.ts'
import { createFileProtocol } from './file-protocol.ts'
import { registerFilesBridge } from './files-bridge.ts'

const ID = '0a1b2c3d-0000-4000-8000-000000000001'

function setup(links: Readonly<Record<string, string>> = {}) {
  let ids = 0
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain: IpcMainApi = {
    handle: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
    on: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
  }
  const store = new MemoryFileStore()
  const sent: unknown[][] = []
  const files = registerFilesBridge({
    ipcMain,
    store,
    ignore: { isIgnored: async (path: string) => path.endsWith('.env') },
    logger: silentLogger,
    send: (...args) => void sent.push(args),
    newId: () => (ids++ === 0 ? ID : `0a1b2c3d-0000-4000-8000-${String(ids).padStart(12, '0')}`),
    realPath: async (path) => links[path] ?? path,
  })
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)?.({}, ...args)
  const protocol = createFileProtocol({ pathOf: files.mediaPath, store, logger: silentLogger })
  return { call, store, sent, files, protocol }
}

const refused = { ok: false, error: { data: { code: 'DCK-IPC-003' } } }

describe('registerFilesBridge open and save', () => {
  it('should open a file by its absolute path and refuse any other path', async () => {
    // Arrange
    const { call, store } = setup()
    store.put('/home/ana/acme/index.ts', 'one\n')

    // Act
    const opened = await call(hostChannels.filesOpen, '/home/ana/acme/index.ts')
    const relative = await call(hostChannels.filesOpen, 'acme/index.ts')
    const withNul = await call(hostChannels.filesOpen, '/home/ana/acme/index.ts\0.png')
    const notText = await call(hostChannels.filesOpen, 42)

    // Assert
    expect(opened).toMatchObject({ ok: true, value: { kind: 'text', base: { text: 'one\n' } } })
    for (const answer of [relative, withNul, notText]) expect(answer).toMatchObject(refused)
  })

  it('should save an opened text while the disk holds its base, then refuse an older base', async () => {
    // Arrange
    const { call, store } = setup()
    store.put('/home/ana/acme/.env', 'TOKEN=abc\n')
    await call(hostChannels.filesOpen, '/home/ana/acme/.env')
    const base = store.stampOf('/home/ana/acme/.env')

    // Act
    const saved = await call(hostChannels.filesSave, {
      path: '/home/ana/acme/.env',
      text: 'TOKEN=xyz\n',
      expected: base,
    })
    const again = await call(hostChannels.filesSave, {
      path: '/home/ana/acme/.env',
      text: 'TOKEN=old\n',
      expected: base,
    })

    // Assert
    const now = store.stampOf('/home/ana/acme/.env')
    expect(saved).toEqual({ ok: true, value: { kind: 'written', stamp: now } })
    expect(again).toEqual({ ok: true, value: { kind: 'changed', disk: now } })
    expect(new TextDecoder().decode(store.files.get('/home/ana/acme/.env')?.bytes)).toBe(
      'TOKEN=xyz\n',
    )
  })

  it('should save in the encoding the file was read in when it has a byte order mark', async () => {
    // Arrange
    const { call, store } = setup()
    store.put('/a/win.txt', Uint8Array.of(0xef, 0xbb, 0xbf, 0x61))
    await call(hostChannels.filesOpen, '/a/win.txt')

    // Act
    await call(hostChannels.filesSave, {
      path: '/a/win.txt',
      text: 'b',
      expected: store.stampOf('/a/win.txt'),
    })

    // Assert
    expect([...(store.files.get('/a/win.txt')?.bytes ?? [])]).toEqual([0xef, 0xbb, 0xbf, 0x62])
  })

  it('should refuse to save a path never opened, a read only text, an image or a malformed request', async () => {
    // Arrange
    const { call, store } = setup()
    store.put('/a/latin.txt', Uint8Array.of(0xe9))
    store.put('/a/logo.png', Uint8Array.of(0x89, 0x50))
    store.put('/a/other.ts', 'x\n')
    await call(hostChannels.filesOpen, '/a/latin.txt')
    await call(hostChannels.filesOpen, '/a/logo.png')
    const save = (path: string, extra: object = {}) =>
      call(hostChannels.filesSave, { path, text: 'y', expected: store.stampOf(path), ...extra })

    // Act
    const answers = await Promise.all([
      save('/a/other.ts'),
      save('/a/latin.txt'),
      save('/a/logo.png'),
      save('/a/latin.txt', { expected: { size: -1, mtimeMs: 0, hash: 'x' } }),
    ])

    // Assert
    for (const answer of answers) expect(answer).toMatchObject(refused)
    expect(store.calls.filter((call) => call.startsWith('write'))).toEqual([])
  })
})

describe('registerFilesBridge watch', () => {
  it('should send the changes of an opened file until the last watch of it is undone', async () => {
    // Arrange
    const { call, store, sent } = setup()
    store.put('/a/index.ts', 'one\n')
    await call(hostChannels.filesOpen, '/a/index.ts')
    const change: FileChange = { kind: 'deleted' }

    // Act
    const first = await call(hostChannels.filesWatch, { path: '/a/index.ts' })
    await call(hostChannels.filesWatch, {
      path: '/a/index.ts',
      since: store.stampOf('/a/index.ts'),
    })
    store.emit('/a/index.ts', change)
    call(hostChannels.filesUnwatch, '/a/index.ts')
    store.emit('/a/index.ts', change)
    call(hostChannels.filesUnwatch, '/a/index.ts')
    store.emit('/a/index.ts', change)

    // Assert
    expect(first).toEqual({ ok: true, value: null })
    expect(store.calls.filter((call) => call.startsWith('watch'))).toEqual(['watch /a/index.ts'])
    expect(sent).toEqual([
      [hostChannels.filesChanged, '/a/index.ts', change],
      [hostChannels.filesChanged, '/a/index.ts', change],
    ])
  })

  it('should refuse to watch a file that was not opened', async () => {
    const { call, store } = setup()
    store.put('/a/index.ts', 'one\n')

    const answer = await call(hostChannels.filesWatch, { path: '/a/index.ts' })

    expect(answer).toMatchObject(refused)
  })

  it('should stop every watch when the window closes', async () => {
    // Arrange
    const { call, store, sent, files } = setup()
    store.put('/a/index.ts', 'one\n')
    await call(hostChannels.filesOpen, '/a/index.ts')
    await call(hostChannels.filesWatch, { path: '/a/index.ts' })

    // Act
    files.closeAll()
    store.emit('/a/index.ts', { kind: 'deleted' })

    // Assert
    expect(sent).toEqual([])
  })
})

describe('file protocol', () => {
  const get = (url: string, method = 'GET') => new Request(url, { method })

  it('should serve the bytes of an opened image with its type', async () => {
    // Arrange
    const { call, store, protocol } = setup()
    store.put('/home/ana/acme/logo.png', Uint8Array.of(0x89, 0x50, 0x4e, 0x47))
    const opened = (await call(hostChannels.filesOpen, '/home/ana/acme/logo.png')) as {
      value: { url: string }
    }

    // Act
    const response = await protocol(get(opened.value.url))

    // Assert
    expect(opened.value.url).toBe(`dck-file://open/${ID}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it.each([
    ['an id never given', 'dck-file://open/0a1b2c3d-0000-4000-8000-000000000002'],
    ['a path in place of an id', 'dck-file://open/home/ana/acme/logo.png'],
    ['another host', `dck-file://evil.example.com/${ID}`],
    ['a remote address', `https://gitlab.example.com/${ID}`],
  ])('should refuse %s', async (_name, url) => {
    // Arrange
    const { call, store, protocol } = setup()
    store.put('/home/ana/acme/logo.png', Uint8Array.of(0x89))
    await call(hostChannels.filesOpen, '/home/ana/acme/logo.png')

    // Act
    const response = await protocol(get(url))

    // Assert
    expect(response.status).toBe(404)
  })

  it('should refuse a request that is not a read without reading the file', async () => {
    // Arrange
    const { call, store, protocol } = setup()
    store.put('/home/ana/acme/logo.png', Uint8Array.of(0x89))
    await call(hostChannels.filesOpen, '/home/ana/acme/logo.png')

    // Act
    const posted = await protocol(get(`dck-file://open/${ID}`, 'POST'))

    // Assert
    expect(posted.status).toBe(404)
    expect(store.calls.filter((call) => call.startsWith('read'))).toEqual([])
  })
})

describe('registerFilesBridge editorconfig and ignored', () => {
  it('should list the editorconfig files above an opened file up to the one marked root', async () => {
    // Arrange
    const { call, store } = setup()
    store.put('/home/ana/acme/src/login.ts', 'x\n')
    store.put('/home/ana/acme/src/.editorconfig', '[*.ts]\nindent_size = 4\n')
    store.put('/home/ana/acme/.editorconfig', 'root = true\n[*]\nindent_size = 2\n')
    store.put('/home/ana/.editorconfig', '[*]\nindent_style = tab\n')
    await call(hostChannels.filesOpen, '/home/ana/acme/src/login.ts')

    // Act
    const files = await call(hostChannels.filesEditorConfig, '/home/ana/acme/src/login.ts')

    // Assert
    expect(files).toEqual([
      { dir: '/home/ana/acme/src', text: '[*.ts]\nindent_size = 4\n' },
      { dir: '/home/ana/acme', text: 'root = true\n[*]\nindent_size = 2\n' },
    ])
  })

  it('should answer nothing for a file that was not opened when asked for its settings', async () => {
    const { call, store } = setup()
    store.put('/home/ana/.editorconfig', '[*]\nindent_style = tab\n')

    expect(await call(hostChannels.filesEditorConfig, '/home/ana/notes.txt')).toEqual([])
    expect(await call(hostChannels.filesIgnored, '/home/ana/.env')).toBe(false)
  })

  it('should ask git whether an opened file is ignored when the window asks', async () => {
    // Arrange
    const { call, store } = setup()
    store.put('/home/ana/acme/.env', 'TOKEN=x\n')
    store.put('/home/ana/acme/app.ts', 'x\n')
    await call(hostChannels.filesOpen, '/home/ana/acme/.env')
    await call(hostChannels.filesOpen, '/home/ana/acme/app.ts')

    // Act
    const env = await call(hostChannels.filesIgnored, '/home/ana/acme/.env')
    const app = await call(hostChannels.filesIgnored, '/home/ana/acme/app.ts')

    // Assert
    expect([env, app]).toEqual([true, false])
  })
})

describe('registerFilesBridge Markdown images', () => {
  const README = '/home/ana/acme/docs/README.md'

  async function openReadme(links: Readonly<Record<string, string>> = {}) {
    const bench = setup(links)
    bench.store.put(README, '# Acme\n')
    bench.store.put('/home/ana/acme/docs/img/shot.png', Uint8Array.of(0x89, 0x50))
    bench.store.put('/home/ana/acme/docs/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>')
    bench.store.put('/home/ana/acme/docs/notes.txt', 'secret\n')
    bench.store.put('/home/ana/acme/logo.png', Uint8Array.of(0x89))
    await bench.call(hostChannels.filesOpen, README)
    return bench
  }

  it('should give an address to an image under the Markdown file folder and serve it', async () => {
    // Arrange
    const { call, protocol } = await openReadme()

    // Act
    const urls = (await call(hostChannels.filesAssets, {
      document: README,
      paths: ['/home/ana/acme/docs/img/shot.png', '/home/ana/acme/docs/logo.svg'],
    })) as string[]
    const png = await protocol(new Request(urls[0] ?? ''))
    const svg = await protocol(new Request(urls[1] ?? ''))

    // Assert
    expect(urls.every((url) => url.startsWith('dck-file://open/'))).toBe(true)
    expect(png.status).toBe(200)
    expect(svg.headers.get('content-type')).toBe('image/svg+xml')
    expect(svg.headers.get('content-security-policy')).toContain('sandbox')
  })

  it.each([
    ['a file outside the folder', '/home/ana/acme/logo.png'],
    ['a path that climbs out', '/home/ana/acme/docs/../logo.png'],
    ['a file that is not an image', '/home/ana/acme/docs/notes.txt'],
    ['a missing image', '/home/ana/acme/docs/gone.png'],
    ['the folder itself', '/home/ana/acme/docs'],
  ])('should refuse %s', async (_name, path) => {
    const { call } = await openReadme()

    const urls = await call(hostChannels.filesAssets, { document: README, paths: [path] })

    expect(urls).toEqual([null])
  })

  it('should refuse an image whose link leads out of the folder', async () => {
    const { call } = await openReadme({ '/home/ana/acme/docs/img/shot.png': '/etc/shot.png' })

    const urls = await call(hostChannels.filesAssets, {
      document: README,
      paths: ['/home/ana/acme/docs/img/shot.png'],
    })

    expect(urls).toEqual([null])
  })

  it('should refuse images for a file that is not an open Markdown file', async () => {
    // Arrange
    const { call, store } = await openReadme()
    store.put('/home/ana/acme/docs/index.ts', 'x\n')
    await call(hostChannels.filesOpen, '/home/ana/acme/docs/index.ts')

    // Act
    const text = await call(hostChannels.filesAssets, {
      document: '/home/ana/acme/docs/index.ts',
      paths: ['/home/ana/acme/docs/img/shot.png'],
    })
    const never = await call(hostChannels.filesAssets, {
      document: '/home/ana/other/README.md',
      paths: ['/home/ana/other/a.png'],
    })
    const malformed = await call(hostChannels.filesAssets, { document: README, paths: 'a.png' })

    // Assert
    expect([text, never, malformed]).toEqual([[], [], []])
  })

  it('should stop serving the images when the Markdown file is released', async () => {
    // Arrange
    const { call, protocol } = await openReadme()
    const [url] = (await call(hostChannels.filesAssets, {
      document: README,
      paths: ['/home/ana/acme/docs/img/shot.png'],
    })) as string[]

    // Act
    call(hostChannels.filesRelease, README)
    const response = await protocol(new Request(url ?? ''))

    // Assert
    expect(response.status).toBe(404)
  })
})

describe('registerFilesBridge image bytes', () => {
  it('should give the bytes of an opened image and nothing for a text or a file never opened', async () => {
    // Arrange
    const { call, store } = setup()
    store.put('/home/ana/acme/logo.png', Uint8Array.of(0x89, 0x50, 0x4e, 0x47))
    store.put('/home/ana/acme/index.ts', 'one\n')
    store.put('/home/ana/acme/other.png', Uint8Array.of(0x89))
    await call(hostChannels.filesOpen, '/home/ana/acme/logo.png')
    await call(hostChannels.filesOpen, '/home/ana/acme/index.ts')

    // Act
    const image = await call(hostChannels.filesBytes, '/home/ana/acme/logo.png')
    const text = await call(hostChannels.filesBytes, '/home/ana/acme/index.ts')
    const never = await call(hostChannels.filesBytes, '/home/ana/acme/other.png')
    const relative = await call(hostChannels.filesBytes, 'logo.png')

    // Assert
    expect([...((image as Uint8Array | undefined) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect([text, never, relative]).toEqual([undefined, undefined, undefined])
  })
})
