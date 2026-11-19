import { markedEncoding } from './text-codec.ts'

export const FILE_LIMITS = {
  // Past this a text shows without syntax colors: a jump deep into it would cost a frame per key (F0)
  colorBytes: 2 * 1024 * 1024,
  // Past this a text opens read only
  editableBytes: 5 * 1024 * 1024,
  // Past this only the card shows, as for a binary
  openBytes: 50 * 1024 * 1024,
  // As git: a NUL among the first 8000 bytes makes a file binary
  probeBytes: 8000,
  // Past this a Markdown file opens in the editor only: a longer preview costs a visible wait (F0)
  previewBytes: 200 * 1024,
  // An image is drawn from a bitmap at most this many pixels on its long side
  imageSide: 2048,
  // Past this an image shows the card: its decode peaks at about 1.6 times its full size (F0)
  imagePixels: 50_000_000,
} as const

// How a file shows: edited, looked at, or a card with its kind and size and "Open in the system's app"
export type FileKind = 'text' | 'markdown' | 'image' | 'pdf' | 'binary' | 'too-large'

// The window draws an opened image or PDF from this protocol, which serves no other path
export const FILE_SCHEME = 'dck-file'

// The images Chromium draws; an SVG is text and opens in the editor
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
}

const MARKDOWN = new Set(['md', 'markdown'])

// An SVG opens as a text to edit and shows as an image, drawn by Chromium as one, so its scripts never run
const SVG_TYPE = 'image/svg+xml'

// Lowercase, without the dot; a name that only starts with a dot (`.env`) has none
export function extensionOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// The media type of a file the window looks at (an image or a PDF); undefined for any other file
export const mediaTypeOf = (path: string): string | undefined => MEDIA_TYPES[extensionOf(path)]

export const isSvg = (path: string): boolean => extensionOf(path) === 'svg'

// What the protocol may serve: an image, an SVG or a PDF; undefined for any other file
export const servedTypeOf = (path: string): string | undefined =>
  isSvg(path) ? SVG_TYPE : mediaTypeOf(path)

// An image a Markdown preview may draw from the file's folder: never a PDF nor any other kind
export function imageTypeOf(path: string): string | undefined {
  const type = servedTypeOf(path)
  return type?.startsWith('image/') ? type : undefined
}

// What the name and the size decide alone; undefined when the first bytes must be read
export function kindFromName(path: string, size: number): FileKind | undefined {
  if (size > FILE_LIMITS.openBytes) return 'too-large'
  const media = mediaTypeOf(path)
  if (media === 'application/pdf') return 'pdf'
  if (media !== undefined) return 'image'
  return undefined
}

// The rest from the file's first bytes: UTF-16 with its mark is text despite its NUL bytes
export function kindFromHead(path: string, head: Uint8Array): 'text' | 'markdown' | 'binary' {
  const utf16 = markedEncoding(head)?.startsWith('utf-16') ?? false
  const binary = !utf16 && head.subarray(0, FILE_LIMITS.probeBytes).includes(0)
  if (binary) return 'binary'
  return MARKDOWN.has(extensionOf(path)) ? 'markdown' : 'text'
}
