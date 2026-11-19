// Whether an image holds more than one frame, from its first bytes: the window draws only the first one
// and says so. Formats: GIF, APNG, WebP and AVIF; a head too short to tell reads as a still image
export function isAnimatedImage(head: Uint8Array): boolean {
  return gifIsAnimated(head) || pngIsAnimated(head) || webpIsAnimated(head) || avifIsAnimated(head)
}

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length))

const uint32 = (bytes: Uint8Array, at: number) =>
  (((bytes[at] ?? 0) << 24) |
    ((bytes[at + 1] ?? 0) << 16) |
    ((bytes[at + 2] ?? 0) << 8) |
    (bytes[at + 3] ?? 0)) >>>
  0

// The sub-blocks that follow an extension or an image's data, each led by its length, up to a 0
function skipSubBlocks(head: Uint8Array, at: number): number {
  let position = at
  while (position < head.length) {
    const length = head[position] ?? 0
    position += 1 + length
    if (length === 0) return position
  }
  return head.length
}

// A loop extension (NETSCAPE2.0 or ANIMEXTS1.0) or a second image says it moves
function gifIsAnimated(head: Uint8Array): boolean {
  if (ascii(head, 0, 4) !== 'GIF8' || head.length < 13) return false
  const flags = head[10] ?? 0
  let at = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0)
  let images = 0
  while (at < head.length) {
    const block = head[at]
    if (block === 0x21) {
      const label = head[at + 1]
      const name = ascii(head, at + 3, 11)
      if (label === 0xff && (name === 'NETSCAPE2.0' || name === 'ANIMEXTS1.0')) return true
      at = skipSubBlocks(head, at + 2)
    } else if (block === 0x2c) {
      images++
      if (images > 1) return true
      const local = head[at + 9] ?? 0
      at += 10 + (local & 0x80 ? 3 * 2 ** ((local & 0x07) + 1) : 0)
      // The LZW code size, then the image's data
      at = skipSubBlocks(head, at + 1)
    } else return false
  }
  return false
}

// APNG: an `acTL` chunk before the first `IDAT`
function pngIsAnimated(head: Uint8Array): boolean {
  if (ascii(head, 1, 3) !== 'PNG') return false
  let at = 8
  while (at + 8 <= head.length) {
    const type = ascii(head, at + 4, 4)
    if (type === 'acTL') return true
    if (type === 'IDAT') return false
    at += 12 + uint32(head, at)
  }
  return false
}

// The animation flag of the extended header (`VP8X`)
function webpIsAnimated(head: Uint8Array): boolean {
  if (ascii(head, 0, 4) !== 'RIFF' || ascii(head, 8, 4) !== 'WEBP') return false
  return ascii(head, 12, 4) === 'VP8X' && ((head[20] ?? 0) & 0x02) !== 0
}

// An image sequence (`avis`) among the file type's brands
function avifIsAnimated(head: Uint8Array): boolean {
  if (ascii(head, 4, 4) !== 'ftyp') return false
  const size = Math.min(uint32(head, 0), head.length)
  for (let at = 8; at + 4 <= size; at += 4) if (ascii(head, at, 4) === 'avis') return true
  return false
}
