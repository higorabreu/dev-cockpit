import { describe, expect, it } from 'vitest'
import { MemoryFileStore } from '../testing/fakes.ts'
import {
  extensionOf,
  FILE_LIMITS,
  imageTypeOf,
  kindFromHead,
  kindFromName,
  mediaTypeOf,
  servedTypeOf,
} from './file-kind.ts'
import { createFileOpener } from './file-opener.ts'

const MB = 1024 * 1024

function setup() {
  const store = new MemoryFileStore()
  const opener = createFileOpener({ store, urlOf: (path) => `dck-file://open/${path.length}` })
  return { store, opener }
}

describe('file kinds', () => {
  it.each([
    ['/home/ana/acme/logo.PNG', 'png'],
    ['/home/ana/acme/.env', ''],
    ['/home/ana/acme/.env.local', 'local'],
    ['C:\\Users\\ana\\notes.md', 'md'],
    ['/home/ana/acme.backend/Makefile', ''],
  ])('should read the extension of %s as %s', (path, extension) => {
    expect(extensionOf(path)).toBe(extension)
  })

  it('should decide images, PDF and files past the limit by name and size alone', () => {
    expect(kindFromName('/a/photo.jpeg', 10)).toBe('image')
    expect(kindFromName('/a/manual.pdf', 10)).toBe('pdf')
    expect(kindFromName('/a/photo.jpeg', FILE_LIMITS.openBytes + 1)).toBe('too-large')
    expect(kindFromName('/a/dump.sql', FILE_LIMITS.openBytes + 1)).toBe('too-large')
    expect(kindFromName('/a/dump.sql', FILE_LIMITS.openBytes)).toBeUndefined()
    expect(kindFromName('/a/icon.svg', 10)).toBeUndefined()
  })

  it('should take a NUL among the first bytes for binary unless a UTF-16 mark starts the file', () => {
    expect(kindFromHead('/a/app.bin', Uint8Array.of(0x7f, 0x45, 0, 1))).toBe('binary')
    expect(kindFromHead('/a/win.txt', Uint8Array.of(0xff, 0xfe, 0x61, 0))).toBe('text')
    expect(kindFromHead('/a/README.md', new TextEncoder().encode('# Title\n'))).toBe('markdown')
  })

  it('should give the media type of an image or a PDF and none of a text', () => {
    expect(mediaTypeOf('/a/b.webp')).toBe('image/webp')
    expect(mediaTypeOf('/a/b.pdf')).toBe('application/pdf')
    expect(mediaTypeOf('/a/b.svg')).toBeUndefined()
  })

  it('should serve an SVG as an image and keep a PDF out of the images when asked for a type', () => {
    expect(servedTypeOf('/a/logo.SVG')).toBe('image/svg+xml')
    expect(servedTypeOf('/a/manual.pdf')).toBe('application/pdf')
    expect(servedTypeOf('/a/notes.md')).toBeUndefined()
    expect(imageTypeOf('/a/logo.svg')).toBe('image/svg+xml')
    expect(imageTypeOf('/a/shot.png')).toBe('image/png')
    expect(imageTypeOf('/a/manual.pdf')).toBeUndefined()
  })
})

describe('createFileOpener', () => {
  it('should open a text with its base and read it whole when it is code', async () => {
    // Arrange
    const { store, opener } = setup()
    store.put('/home/ana/acme/index.ts', 'export const a = 1\r\n')

    // Act
    const opened = await opener.open('/home/ana/acme/index.ts')

    // Assert
    expect(opened).toEqual({
      ok: true,
      value: {
        kind: 'text',
        path: '/home/ana/acme/index.ts',
        size: 20,
        base: {
          text: 'export const a = 1\r\n',
          stamp: store.stampOf('/home/ana/acme/index.ts'),
          encoding: 'utf-8',
          lineEnding: 'crlf',
        },
        readOnly: undefined,
      },
    })
  })

  it('should open a .env like any text when it holds secrets', async () => {
    const { store, opener } = setup()
    store.put('/home/ana/acme/.env', 'TOKEN=abc\n')

    const opened = await opener.open('/home/ana/acme/.env')

    expect(opened).toMatchObject({ ok: true, value: { kind: 'text', readOnly: undefined } })
  })

  it('should open Markdown as markdown with its text', async () => {
    const { store, opener } = setup()
    store.put('/home/ana/acme/README.md', '# Acme\n')

    const opened = await opener.open('/home/ana/acme/README.md')

    expect(opened).toMatchObject({
      ok: true,
      value: { kind: 'markdown', base: { text: '# Acme\n' } },
    })
  })

  it('should open a text read only when it is past the editable size', async () => {
    const { store, opener } = setup()
    store.put('/home/ana/acme/big.log', 'x'.repeat(5 * MB + 1))

    const opened = await opener.open('/home/ana/acme/big.log')

    expect(opened).toMatchObject({ ok: true, value: { kind: 'text', readOnly: 'large' } })
  })

  it('should open a text read only when it is not UTF-8', async () => {
    const { store, opener } = setup()
    store.put('/home/ana/acme/latin.txt', Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x0a))

    const opened = await opener.open('/home/ana/acme/latin.txt')

    expect(opened).toMatchObject({
      ok: true,
      value: { kind: 'text', readOnly: 'encoding', base: { encoding: 'other' } },
    })
  })

  it('should give an image its address reading only its first bytes', async () => {
    // Arrange
    const { store, opener } = setup()
    store.put('/home/ana/acme/logo.png', Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0))

    // Act
    const opened = await opener.open('/home/ana/acme/logo.png')

    // Assert
    expect(opened).toEqual({
      ok: true,
      value: {
        kind: 'image',
        path: '/home/ana/acme/logo.png',
        size: 5,
        url: 'dck-file://open/23',
        animated: false,
      },
    })
    expect(store.calls).toEqual(['stat /home/ana/acme/logo.png', 'head /home/ana/acme/logo.png'])
  })

  it('should say an image moves when its first bytes name more than one frame', async () => {
    const { store, opener } = setup()
    store.put('/a/spin.webp', new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8X\n\0\0\0\x02\0\0\0'))

    const opened = await opener.open('/a/spin.webp')

    expect(opened).toMatchObject({ ok: true, value: { kind: 'image', animated: true } })
  })

  it('should give a PDF its address without reading it', async () => {
    const { store, opener } = setup()
    store.put('/a/manual.pdf', '%PDF-1.7')

    const opened = await opener.open('/a/manual.pdf')

    expect(opened).toEqual({
      ok: true,
      value: { kind: 'pdf', path: '/a/manual.pdf', size: 8, url: 'dck-file://open/13' },
    })
    expect(store.calls).toEqual(['stat /a/manual.pdf'])
  })

  it('should open an SVG as a text with an address to draw it from', async () => {
    const { store, opener } = setup()
    store.put('/a/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>')

    const opened = await opener.open('/a/logo.svg')

    expect(opened).toMatchObject({
      ok: true,
      value: { kind: 'text', url: 'dck-file://open/11', readOnly: undefined },
    })
  })

  it('should read only the first bytes of a binary and nothing of a file past the limit', async () => {
    // Arrange
    const { store, opener } = setup()
    store.put('/a/app.bin', Uint8Array.of(1, 0, 2))
    store.put('/a/dump.sql', new Uint8Array(FILE_LIMITS.openBytes + 1))

    // Act
    const binary = await opener.open('/a/app.bin')
    const large = await opener.open('/a/dump.sql')

    // Assert
    expect(binary).toEqual({ ok: true, value: { kind: 'binary', path: '/a/app.bin', size: 3 } })
    expect(large).toMatchObject({ ok: true, value: { kind: 'too-large' } })
    expect(store.calls).toEqual(['stat /a/app.bin', 'head /a/app.bin', 'stat /a/dump.sql'])
  })

  it('should fail with the store error when the file does not exist', async () => {
    const opened = await setup().opener.open('/home/ana/acme/missing.ts')

    expect(opened).toMatchObject({ ok: false, error: { data: { code: 'DCK-FIL-001' } } })
  })
})
