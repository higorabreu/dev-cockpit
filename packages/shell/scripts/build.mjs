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
  // Native modules load from dist/node_modules; the keyring and koffi only on Windows, the only system
  // that copies them
  external: ['electron', 'node-pty', '@napi-rs/keyring', 'koffi'],
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
// Windows' native bindings, the Credential Manager's and koffi for the process table, each with the
// prebuilt binary for this machine that pnpm links beside it (beside the scope folder for the keyring)
if (process.platform === 'win32') {
  const bindings = [
    { adapter: 'windows-credential', name: '@napi-rs/keyring', into: '@napi-rs' },
    { adapter: 'windows-proc', name: 'koffi', into: '' },
  ]
  for (const { adapter, name, into } of bindings) {
    // Through the adapter's own link, since koffi's exports hide its package.json from require.resolve
    const binding = realpathSync(join(root, '..', 'adapters', adapter, 'node_modules', name))
    for (const sibling of readdirSync(dirname(binding))) {
      cpSync(join(dirname(binding), sibling), join(dist, 'node_modules', into, sibling), {
        recursive: true,
        dereference: true,
      })
    }
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
