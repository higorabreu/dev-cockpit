import { execFile } from 'node:child_process'
import type { Rectangle } from '@dck/core'

const TIMEOUT_MS = 1000

// O Mutter publica a área útil de cada monitor aqui; o Electron só enxerga a do primário
export function parseGtkWorkareas(output: string): Rectangle[] {
  const match = output.match(/=\s*([\d,\s-]+)$/m)
  if (!match?.[1]) return []
  const numbers = match[1].split(',').map((part) => Number(part.trim()))
  const rectangles: Rectangle[] = []
  for (let index = 0; index + 3 < numbers.length; index += 4) {
    const [x, y, width, height] = numbers.slice(index, index + 4)
    if ([x, y, width, height].some((value) => value === undefined || Number.isNaN(value))) return []
    rectangles.push({
      x: x as number,
      y: y as number,
      width: width as number,
      height: height as number,
    })
  }
  return rectangles
}

const readRoot = () =>
  new Promise<string>((resolve) => {
    execFile('xprop', ['-root', '_GTK_WORKAREAS_D0'], { timeout: TIMEOUT_MS }, (error, stdout) =>
      resolve(error ? '' : stdout),
    )
  })

// Leitura síncrona para quem pergunta e atualização em segundo plano para a próxima pergunta
export function createGtkWorkareas(read: () => Promise<string> = readRoot): () => Rectangle[] {
  let current: Rectangle[] = []
  const refresh = () => {
    void read().then((output) => {
      current = parseGtkWorkareas(output)
    })
  }
  refresh()
  return () => {
    refresh()
    return current
  }
}
