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
  external: ['electron', 'node-pty'],
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

// O node-pty do Node (usado nos testes) e o do Electron têm ABIs diferentes: o do shell é uma cópia recompilada
const source = realpathSync(dirname(require.resolve('node-pty/package.json')))
// As dependências do node-pty (como o node-addon-api) ficam ao lado dele na pasta do pnpm
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
const electronVersion = JSON.parse(
  readFileSync(require.resolve('electron/package.json'), 'utf8'),
).version
await rebuild({ buildPath: dist, electronVersion, onlyModules: ['node-pty'], force: true })
console.log(`shell construído em ${dist} para o Electron ${electronVersion}`)
