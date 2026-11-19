import { markedEncoding } from './text-codec.ts'

export const FILE_LIMITS = {
  // Past this a text opens read only
  editableBytes: 5 * 1024 * 1024,
  // Past this only the card shows, as for a binary
  openBytes: 50 * 1024 * 1024,
  // As git: a NUL among the first 8000 bytes makes a file binary
  probeBytes: 8000,
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

// Lowercase, without the dot; a name that only starts with a dot (`.env`) has none
export function extensionOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// The media type of a file the window looks at (an image or a PDF); undefined for any other file
export const mediaTypeOf = (path: string): string | undefined => MEDIA_TYPES[extensionOf(path)]

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
