// Runs after install: a fresh macOS checkout cannot open a terminal until node-pty's spawn-helper is executable
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureSpawnHelperExecutable } from '../packages/adapters/node-pty/src/spawn-helper.ts'

const adapter = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'adapters',
  'node-pty',
)
const require = createRequire(join(adapter, 'package.json'))

let packageDir
try {
  packageDir = dirname(require.resolve('node-pty/package.json'))
} catch {
  // node-pty is not installed yet (a partial install), so there is nothing to fix
  process.exit(0)
}

const fixed = await ensureSpawnHelperExecutable(packageDir)
if (fixed.length > 0) console.log(`node-pty: made ${fixed.length} spawn-helper executable`)
