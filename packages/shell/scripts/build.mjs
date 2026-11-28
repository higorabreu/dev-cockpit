import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rebuild } from '@electron/rebuild'
import { build } from 'esbuild'
import { ensureSpawnHelperExecutable } from '../../adapters/node-pty/src/spawn-helper.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const require = createRequire(import.meta.url)

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // Native modules load from dist/node_modules; the keyring only on Windows, which is the only system that copies it
  external: ['electron', 'node-pty', '@napi-rs/keyring'],
  // Its UMD build loads its parts with a require the bundler cannot follow; the ESM build bundles whole
  alias: {
    'jsonc-parser': join(
      root,
      '..',
      'adapters',
      'jsonc',
      'node_modules',
      'jsonc-parser',
      'lib',
      'esm',
      'main.js',
    ),
  },
}
await build({
  ...common,
  entryPoints: [join(root, 'src/main.ts')],
  outfile: join(dist, 'main.cjs'),
})
await build({
  ...common,
  entryPoints: [join(root, 'src/preload.ts')],
  outfile: join(dist, 'preload.cjs'),
})
await build({
  ...common,
  entryPoints: [join(root, '..', 'daemon', 'src', 'main.ts')],
  outfile: join(dist, 'daemon.cjs'),
})

cpSync(join(root, '..', 'ui', 'dist'), join(dist, 'ui'), { recursive: true })
cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true })

// Node's node-pty (used by tests) and Electron's have different ABIs: the shell's is a rebuilt copy
const source = realpathSync(dirname(require.resolve('node-pty/package.json')))
// node-pty's dependencies (like node-addon-api) sit next to it in the pnpm folder
for (const name of readdirSync(dirname(source))) {
  cpSync(join(dirname(source), name), join(dist, 'node_modules', name), {
    recursive: true,
    dereference: true,
  })
}
writeFileSync(
  join(dist, 'package.json'),
  JSON.stringify({ name: 'dck-shell-runtime', dependencies: { 'node-pty': '*' } }),
)
// The Credential Manager binding and its prebuilt binary for this machine, which pnpm links beside it
if (process.platform === 'win32') {
  const fromAdapter = createRequire(
    join(root, '..', 'adapters', 'windows-credential', 'package.json'),
  )
  const keyring = realpathSync(dirname(fromAdapter.resolve('@napi-rs/keyring/package.json')))
  for (const name of readdirSync(dirname(keyring))) {
    cpSync(join(dirname(keyring), name), join(dist, 'node_modules', '@napi-rs', name), {
      recursive: true,
      dereference: true,
    })
  }
}
const electronVersion = JSON.parse(
  readFileSync(require.resolve('electron/package.json'), 'utf8'),
).version
// node-pty ships an N-API prebuild for Windows that Electron loads as is (D96), and rebuilding it would
// require Visual Studio's Build Tools
if (process.platform !== 'win32')
  await rebuild({ buildPath: dist, electronVersion, onlyModules: ['node-pty'], force: true })
await ensureSpawnHelperExecutable(join(dist, 'node_modules', 'node-pty'))
console.log(`shell built in ${dist} for Electron ${electronVersion}`)
