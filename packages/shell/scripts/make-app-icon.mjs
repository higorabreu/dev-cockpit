// Gera o ícone do aplicativo (menu de aplicativos): quadrado arredondado escuro com o prompt em
// traço claro. Rodar de novo só se o desenho mudar: `node scripts/make-app-icon.mjs`
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const SAMPLES = 4
const BACKGROUND = [27, 27, 27]
const FOREGROUND = [230, 230, 230]

const distanceToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Coordenadas em unidades de 24
function insideSquare(x, y) {
  const r = 5.5
  const cx = Math.min(Math.max(x, r), 24 - r)
  const cy = Math.min(Math.max(y, r), 24 - r)
  return Math.hypot(x - cx, y - cy) <= r
}

function onGlyph(x, y) {
  const half = 1.1
  if (distanceToSegment(x, y, 6.5, 8.5, 11, 12) <= half) return true
  if (distanceToSegment(x, y, 11, 12, 6.5, 15.5) <= half) return true
  return distanceToSegment(x, y, 13, 16, 18, 16) <= half
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let inside = 0
      let glyph = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = ((px + (sx + 0.5) / SAMPLES) / size) * 24
          const y = ((py + (sy + 0.5) / SAMPLES) / size) * 24
          if (!insideSquare(x, y)) continue
          inside++
          if (onGlyph(x, y)) glyph++
        }
      }
      const total = SAMPLES * SAMPLES
      const mix = inside === 0 ? 0 : glyph / inside
      const at = py * (size * 4 + 1) + 1 + px * 4
      for (let c = 0; c < 3; c++) {
        raw[at + c] = Math.round(BACKGROUND[c] * (1 - mix) + FOREGROUND[c] * mix)
      }
      raw[at + 3] = Math.round((inside / total) * 255)
    }
  }
  return raw
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, crc])
}

function png(size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(render(size))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(out, { recursive: true })
for (const size of [48, 128, 256, 512]) writeFileSync(join(out, `app-${size}.png`), png(size))
console.log('ícones do aplicativo gerados em', out)
