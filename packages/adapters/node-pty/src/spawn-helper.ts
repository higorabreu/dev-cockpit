import { chmod, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const EXECUTABLE = 0o755

// node-pty ships the macOS spawn-helper without the execute bit, so every spawn fails with posix_spawnp
export async function ensureSpawnHelperExecutable(packageDir: string): Promise<readonly string[]> {
  const targets = await readdir(join(packageDir, 'prebuilds')).catch(() => [] as string[])
  const candidates = [
    join(packageDir, 'build', 'Release', 'spawn-helper'),
    ...targets.map((target) => join(packageDir, 'prebuilds', target, 'spawn-helper')),
  ]
  const fixed: string[] = []
  for (const file of candidates) {
    const info = await stat(file).catch(() => undefined)
    if (info === undefined || (info.mode & 0o111) === 0o111) continue
    await chmod(file, EXECUTABLE)
    fixed.push(file)
  }
  return fixed
}
