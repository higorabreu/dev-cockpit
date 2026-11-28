import type { IWindowsPty } from '@xterm/xterm'

// xterm adapts its reflow and its line wrapping to ConPTY, which rewrites the screen by itself; the build
// number tells it which ConPTY fixes it can count on. Undefined off Windows
export function windowsPtyFor(platform: string, systemVersion: string): IWindowsPty | undefined {
  if (platform !== 'win32') return undefined
  const build = Number(systemVersion.split('.')[2])
  return Number.isInteger(build) ? { backend: 'conpty', buildNumber: build } : { backend: 'conpty' }
}
