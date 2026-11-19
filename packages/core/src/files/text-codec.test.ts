import { describe, expect, it } from 'vitest'
import { decodeText, encodeText, lineEndingOf, type TextEncoding } from './text-codec.ts'

const bytes = (...values: number[]) => Uint8Array.from(values)
const BOM = String.fromCharCode(0xfeff)
const REPLACEMENT = String.fromCharCode(0xfffd)

describe('decodeText and encodeText', () => {
  it.each<[TextEncoding, Uint8Array]>([
    ['utf-8', new TextEncoder().encode('olá\n')],
    ['utf-8-bom', bytes(0xef, 0xbb, 0xbf, 0x6f, 0x6c, 0xc3, 0xa1, 0x0a)],
    ['utf-16le', bytes(0xff, 0xfe, 0x6f, 0, 0x6c, 0, 0xe1, 0, 0x0a, 0)],
    ['utf-16be', bytes(0xfe, 0xff, 0, 0x6f, 0, 0x6c, 0, 0xe1, 0, 0x0a)],
  ])(
    'should give back the same bytes when a %s file is decoded and encoded',
    (encoding, content) => {
      // Act
      const decoded = decodeText(content)

      // Assert
      expect(decoded).toEqual({ text: 'olá\n', encoding })
      expect(encodeText(decoded.text, decoded.encoding)).toEqual(content)
    },
  )

  it('should keep a second mark as text when the file starts with two', () => {
    const decoded = decodeText(bytes(0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x61))

    expect(decoded).toEqual({ text: `${BOM}a`, encoding: 'utf-8-bom' })
  })

  it('should call a text other and refuse to encode it when it is not UTF-8', () => {
    // Act
    const decoded = decodeText(bytes(0x63, 0x61, 0x66, 0xe9))

    // Assert
    expect(decoded).toEqual({ text: `caf${REPLACEMENT}`, encoding: 'other' })
    expect(encodeText(decoded.text, decoded.encoding)).toBeUndefined()
  })
})

describe('lineEndingOf', () => {
  it.each([
    ['a\nb\n', 'lf'],
    ['a\r\nb\r\n', 'crlf'],
    ['a\r\nb\n', 'mixed'],
    ['one line', 'none'],
  ])('should read the line endings of %j as %s', (text, ending) => {
    expect(lineEndingOf(text)).toBe(ending)
  })
})
