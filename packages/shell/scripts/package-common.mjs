// What the .deb and the .dmg share: the built dist, the project's Electron, the app folder and the dck CLI
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { shipsNodePtyFile } from './node-pty-files.mjs'

export const NAME = 'dev-cockpit'
export const PRODUCT = 'Dev Cockpit'
export const shell = join(dirname(fileURLToPath(import.meta.url)), '..')
export const repository = join(shell, '..', '..')
export const release = join(repository, 'release')
export const { version } = JSON.parse(readFileSync(join(shell, 'package.json'), 'utf8'))

const require = createRequire(import.meta.url)
const dist = join(shell, 'dist')
const nodePty = join(dist, 'node_modules', 'node-pty')
const insideNodePty = (source) => source === nodePty || source.startsWith(`${nodePty}${sep}`)

if (!existsSync(join(dist, 'main.cjs'))) {
  throw new Error('run `pnpm --filter @dck/shell build` first (dist does not exist)')
}

// Electron downloads its binary on first run instead of on install, so a fresh checkout has no dist yet
export function electronDist() {
  const root = dirname(require.resolve('electron/package.json'))
  if (!existsSync(join(root, 'dist'))) {
    execFileSync(process.execPath, [join(root, 'install.js')], { stdio: 'inherit' })
  }
  return join(root, 'dist')
}

// dist without source maps, with the package.json Electron reads on start
export function stageApp(target) {
  cpSync(dist, target, {
    recursive: true,
    dereference: true,
    // dist's package.json is for the build only; node-pty keeps only what the app loads
    filter: (source) =>
      !source.endsWith('.map') &&
      source !== join(dist, 'package.json') &&
      (!insideNodePty(source) || shipsNodePtyFile(relative(nodePty, source))),
  })
  const manifest = {
    name: NAME,
    productName: PRODUCT,
    version,
    description: 'Guake-style terminal with a project panel',
    main: 'main.cjs',
  }
  writeFileSync(join(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

// The CLI runs inside the packaged Electron itself, without the user's Node
export function buildCli(outfile) {
  return build({
    entryPoints: [join(repository, 'packages', 'cli', 'src', 'main.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'warning',
    banner: {
      js: "import { createRequire as __dckRequire } from 'node:module'; const require = __dckRequire(import.meta.url);",
    },
  })
}
