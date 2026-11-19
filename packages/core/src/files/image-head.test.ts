import { describe, expect, it } from 'vitest'
import { isAnimatedImage } from './image-head.ts'

const bytes = (...parts: (string | readonly number[])[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((letter) => letter.charCodeAt(0)) : part,
    ),
  )

// A 1x1 GIF: header, screen descriptor with a two color table, then its blocks
const gifStart = ['GIF89a', [1, 0, 1, 0, 0x80, 0, 0], [0, 0, 0, 255, 255, 255]] as const
const gifImage = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0]
const loop = [0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0]
const control = [0x21, 0xf9, 4, 0, 10, 0, 0, 0]

const chunk = (type: string, data: number[]) => [
  ...[0, 0, 0, data.length],
  ...[...type].map((c) => c.charCodeAt(0)),
  ...data,
  0,
  0,
  0,
  0,
]
const png = (...chunks: number[][]) =>
  bytes([0x89], 'PNG', [13, 10, 26, 10], ...chunks.map((part) => part))

describe('isAnimatedImage', () => {
  it('should read a GIF as animated when it carries a loop extension', () => {
    expect(isAnimatedImage(bytes(...gifStart, loop, control, gifImage, [0x3b]))).toBe(true)
  })

  it('should read a GIF as animated when it holds a second image', () => {
    expect(isAnimatedImage(bytes(...gifStart, control, gifImage, control, gifImage))).toBe(true)
  })

  it('should read a GIF as still when it holds one image', () => {
    expect(isAnimatedImage(bytes(...gifStart, control, gifImage, [0x3b]))).toBe(false)
  })

  it('should read a PNG as animated when an acTL chunk comes before its data', () => {
    const header = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])

    expect(isAnimatedImage(png(header, chunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0])))).toBe(true)
    expect(isAnimatedImage(png(header, chunk('IDAT', [1, 2, 3])))).toBe(false)
  })

  it('should read a WebP as animated when its extended header sets the animation flag', () => {
    const webp = (flags: number) =>
      bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0, flags, 0, 0, 0])

    expect(isAnimatedImage(webp(0x02))).toBe(true)
    expect(isAnimatedImage(webp(0x10))).toBe(false)
    expect(isAnimatedImage(bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 '))).toBe(false)
  })

  it('should read an AVIF as animated when its brands name an image sequence', () => {
    expect(
      isAnimatedImage(bytes([0, 0, 0, 24], 'ftyp', 'avis', [0, 0, 0, 0], 'avif', 'mif1')),
    ).toBe(true)
    expect(isAnimatedImage(bytes([0, 0, 0, 20], 'ftyp', 'avif', [0, 0, 0, 0], 'mif1'))).toBe(false)
  })

  it('should read anything else as still when the head names no animated format', () => {
    expect(isAnimatedImage(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe(false)
    expect(isAnimatedImage(new Uint8Array(0))).toBe(false)
  })
})
