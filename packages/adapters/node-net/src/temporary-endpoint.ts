import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A fresh endpoint for a test daemon: Windows only listens on named pipes, which live outside the disk
export function temporaryEndpoint(
  prefix: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') return `\\\\.\\pipe\\${prefix}-${randomUUID()}`
  return join(mkdtempSync(join(tmpdir(), `${prefix}-`)), 'daemon.sock')
}
