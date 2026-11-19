// `other` is text that is not valid UTF-8 and has no mark: it shows, read only, and is never written back
export type TextEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'other'

export type LineEnding = 'lf' | 'crlf' | 'mixed' | 'none'

export interface DecodedText {
  readonly text: string
  readonly encoding: TextEncoding
}

const BYTE_ORDER_MARKS = {
  'utf-8-bom': [0xef, 0xbb, 0xbf],
  'utf-16le': [0xff, 0xfe],
  'utf-16be': [0xfe, 0xff],
} as const

type MarkedEncoding = keyof typeof BYTE_ORDER_MARKS

// The encoding a byte order mark names at the start of the file
export const markedEncoding = (bytes: Uint8Array): MarkedEncoding | undefined =>
  (Object.keys(BYTE_ORDER_MARKS) as MarkedEncoding[]).find((encoding) =>
    BYTE_ORDER_MARKS[encoding].every((byte, index) => bytes[index] === byte),
  )

const DECODER_LABELS = {
  'utf-8-bom': 'utf-8',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
} as const

// The text without its byte order mark, which comes back on save
export function decodeText(bytes: Uint8Array): DecodedText {
  const marked = markedEncoding(bytes)
  if (marked) {
    const body = bytes.subarray(BYTE_ORDER_MARKS[marked].length)
    const decoder = new TextDecoder(DECODER_LABELS[marked], { ignoreBOM: true })
    return { text: decoder.decode(body), encoding: marked }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    // Not UTF-8: shown with replacement characters, which is why it stays read only
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'other' }
  }
}

function utf16(text: string, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(text.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < text.length; index++)
    view.setUint16(index * 2, text.charCodeAt(index), littleEndian)
  return bytes
}

const join = (mark: readonly number[], body: Uint8Array) => {
  const bytes = new Uint8Array(mark.length + body.length)
  bytes.set(mark)
  bytes.set(body, mark.length)
  return bytes
}

// The bytes to write in the file's own encoding; undefined for one the cockpit does not write
export function encodeText(text: string, encoding: TextEncoding): Uint8Array | undefined {
  if (encoding === 'utf-8') return new TextEncoder().encode(text)
  if (encoding === 'utf-8-bom')
    return join(BYTE_ORDER_MARKS['utf-8-bom'], new TextEncoder().encode(text))
  if (encoding === 'utf-16le') return join(BYTE_ORDER_MARKS['utf-16le'], utf16(text, true))
  if (encoding === 'utf-16be') return join(BYTE_ORDER_MARKS['utf-16be'], utf16(text, false))
  return undefined
}

export function lineEndingOf(text: string): LineEnding {
  const breaks = text.match(/\r?\n/g) ?? []
  if (breaks.length === 0) return 'none'
  const crlf = breaks.filter((line) => line === '\r\n').length
  if (crlf === 0) return 'lf'
  return crlf === breaks.length ? 'crlf' : 'mixed'
}
