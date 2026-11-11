// Gera o ícone da bandeja: um terminal com o sinal de prompt, em traço claro sobre fundo transparente.
// Rodar de novo só se o desenho mudar: `node scripts/make-icon.mjs`

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const SAMPLES = 8
const COLOR = [230, 230, 230]

const distanceToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Coordenadas em unidades de 24: caixa arredondada, sinal de maior e sublinhado
function covered(x, y) {
  const stroke = 1.1
  const box = { x0: 2.5, y0: 4.5, x1: 21.5, y1: 19.5, r: 3 }
  const cx = Math.min(Math.max(x, box.x0 + box.r), box.x1 - box.r)
  const cy = Math.min(Math.max(y, box.y0 + box.r), box.y1 - box.r)
  const outside = Math.hypot(x - cx, y - cy) - box.r
  const inBox = x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
  if (inBox && Math.abs(outside) <= stroke) return true
  const half = 1.05
  if (distanceToSegment(x, y, 7, 9.5, 10.5, 12) <= half) return true
  if (distanceToSegment(x, y, 10.5, 12, 7, 14.5) <= half) return true
  return distanceToSegment(x, y, 12.5, 15, 16.5, 15) <= half
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let hits = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = ((px + (sx + 0.5) / SAMPLES) / size) * 24
          const y = ((py + (sy + 0.5) / SAMPLES) / size) * 24
          if (covered(x, y)) hits++
        }
      }
      const at = py * (size * 4 + 1) + 1 + px * 4
      raw[at] = COLOR[0]
      raw[at + 1] = COLOR[1]
      raw[at + 2] = COLOR[2]
      raw[at + 3] = Math.round((hits / (SAMPLES * SAMPLES)) * 255)
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
writeFileSync(join(out, 'icon.png'), png(24))
writeFileSync(join(out, 'icon@2x.png'), png(48))
console.log('ícones gerados em', out)
