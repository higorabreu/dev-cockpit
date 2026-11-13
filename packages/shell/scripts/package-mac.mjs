// Builds Dev Cockpit.app and its .dmg from the already built `dist` (`pnpm --filter @dck/shell build`):
// copies the Electron the project already uses, renames it, puts the app in Resources/app, packs the `dck` CLI
// and signs ad hoc. Only macOS's own tools (ditto, plutil, sips, iconutil, lipo, codesign, hdiutil).
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { ensureSpawnHelperExecutable } from '../../adapters/node-pty/src/spawn-helper.ts'

const shell = join(dirname(fileURLToPath(import.meta.url)), '..')
const repository = join(shell, '..', '..')
const require = createRequire(import.meta.url)
const dist = join(shell, 'dist')
const release = join(repository, 'release')

if (process.platform !== 'darwin') throw new Error('the .app can only be built on macOS')
const { version } = JSON.parse(readFileSync(join(shell, 'package.json'), 'utf8'))
const lipoArchitecture = { x64: 'x86_64', arm64: 'arm64' }[process.arch]
if (!lipoArchitecture) throw new Error(`unsupported architecture: ${process.arch}`)
if (!existsSync(join(dist, 'main.cjs'))) {
  throw new Error('run `pnpm --filter @dck/shell build` first (dist does not exist)')
}

const NAME = 'dev-cockpit'
const PRODUCT = 'Dev Cockpit'
const IDENTIFIER = 'io.github.devcockpit'
const stage = join(release, 'mac')
const bundle = join(stage, `${PRODUCT}.app`)
const contents = join(bundle, 'Contents')
const resources = join(contents, 'Resources')

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' })
const setPlist = (file, key, type, value) =>
  run('plutil', ['-replace', key, `-${type}`, value, file])
const readPlist = (file, key) => run('plutil', ['-extract', key, 'raw', '-o', '-', file]).trim()

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

// 1. The Electron already installed in the project; ditto keeps the frameworks' symlinks
const electronRoot = dirname(require.resolve('electron/package.json'))
const electronApp = join(electronRoot, 'dist', 'Electron.app')
// Electron downloads its binary on first run instead of on install, so a fresh checkout has no dist yet
if (!existsSync(electronApp)) {
  execFileSync(process.execPath, [join(electronRoot, 'install.js')], { stdio: 'inherit' })
}
run('ditto', [electronApp, bundle])
rmSync(join(resources, 'default_app.asar'))
rmSync(join(resources, 'electron.icns'))

// 2. Renamed executable and helpers: Electron finds each helper by the main executable's name
renameSync(join(contents, 'MacOS', 'Electron'), join(contents, 'MacOS', PRODUCT))
const frameworks = join(contents, 'Frameworks')
for (const helper of readdirSync(frameworks).filter((name) => name.startsWith('Electron Helper'))) {
  const oldName = helper.replace(/\.app$/, '')
  const newName = oldName.replace('Electron', PRODUCT)
  const helperContents = join(frameworks, `${newName}.app`, 'Contents')
  renameSync(join(frameworks, helper), join(frameworks, `${newName}.app`))
  renameSync(join(helperContents, 'MacOS', oldName), join(helperContents, 'MacOS', newName))
  const plist = join(helperContents, 'Info.plist')
  const identifier = readPlist(plist, 'CFBundleIdentifier').replace(
    'com.github.Electron',
    IDENTIFIER,
  )
  setPlist(plist, 'CFBundleExecutable', 'string', newName)
  setPlist(plist, 'CFBundleName', 'string', newName)
  setPlist(plist, 'CFBundleIdentifier', 'string', identifier)
}

// 3. Info.plist: no Dock icon (LSUIElement), the window opens from the global key
const plist = join(contents, 'Info.plist')
for (const [key, value] of [
  ['CFBundleDisplayName', PRODUCT],
  ['CFBundleName', PRODUCT],
  ['CFBundleExecutable', PRODUCT],
  ['CFBundleIdentifier', IDENTIFIER],
  ['CFBundleShortVersionString', version],
  ['CFBundleVersion', version],
  ['CFBundleIconFile', `${NAME}.icns`],
]) {
  setPlist(plist, key, 'string', value)
}
setPlist(plist, 'LSUIElement', 'bool', 'true')
// The hash points at the default app this script removes
run('plutil', ['-remove', 'ElectronAsarIntegrity', plist])

// 4. The icon, scaled down from the 512 px PNG
const iconset = join(stage, `${NAME}.iconset`)
const iconSource = join(shell, 'assets', 'app-512.png')
mkdirSync(iconset)
for (const [size, name] of [
  [16, '16x16'],
  [32, '16x16@2x'],
  [32, '32x32'],
  [64, '32x32@2x'],
  [128, '128x128'],
  [256, '128x128@2x'],
  [256, '256x256'],
  [512, '256x256@2x'],
  [512, '512x512'],
]) {
  const icon = join(iconset, `icon_${name}.png`)
  run('sips', ['-z', String(size), String(size), iconSource, '--out', icon])
}
run('iconutil', ['-c', 'icns', iconset, '-o', join(resources, `${NAME}.icns`)])
rmSync(iconset, { recursive: true })

// 5. The app: dist without source maps, with the package.json Electron reads on start
const app = join(resources, 'app')
cpSync(dist, app, {
  recursive: true,
  dereference: true,
  // dist's package.json is for the build only; node-pty's and its dependencies' stay
  filter: (source) => !source.endsWith('.map') && source !== join(dist, 'package.json'),
})
writeFileSync(
  join(app, 'package.json'),
  `${JSON.stringify(
    {
      name: NAME,
      productName: PRODUCT,
      version,
      description: 'Guake-style terminal with a project panel',
      main: 'main.cjs',
    },
    null,
    2,
  )}\n`,
)

// 6. node-pty: executable spawn-helper and both binaries built for this machine's architecture
const nodePty = join(app, 'node_modules', 'node-pty')
await ensureSpawnHelperExecutable(nodePty)
for (const binary of ['pty.node', 'spawn-helper']) {
  const file = join(nodePty, 'build', 'Release', binary)
  const architectures = run('lipo', ['-archs', file]).trim().split(' ')
  if (!architectures.includes(lipoArchitecture)) {
    throw new Error(`${binary} is built for ${architectures.join(', ')}, not ${lipoArchitecture}`)
  }
}

// 7. The packaged `dck` CLI, to run inside Electron itself (without nvm's Node)
await build({
  entryPoints: [join(repository, 'packages', 'cli', 'src', 'main.ts')],
  outfile: join(resources, 'dck.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'warning',
  banner: {
    js: "import { createRequire as __dckRequire } from 'node:module'; const require = __dckRequire(import.meta.url);",
  },
})
mkdirSync(join(resources, 'bin'))
writeFileSync(
  join(resources, 'bin', 'dck'),
  `#!/bin/sh
# Runs the CLI inside the packaged Electron; link it into the PATH with ln -s
here=$(dirname "$(realpath "$0")")
exec env ELECTRON_RUN_AS_NODE=1 DCK_PACKAGED=1 "$here/../../MacOS/${PRODUCT}" "$here/../dck.mjs" "$@"
`,
  { mode: 0o755 },
)

// 8. Ad hoc signature: renaming broke Electron's, and Apple Silicon refuses to run unsigned code
run('codesign', ['--force', '--deep', '--sign', '-', bundle])
run('codesign', ['--verify', '--deep', '--strict', bundle])

// 9. The .dmg, with a link to /Applications to drag the app onto
symlinkSync('/Applications', join(stage, 'Applications'))
const output = join(release, `${NAME}_${version}_${process.arch}.dmg`)
rmSync(output, { force: true })
run('hdiutil', ['create', '-volname', PRODUCT, '-srcfolder', stage, '-format', 'UDZO', output])
console.log(`app: ${bundle}`)
console.log(`package: ${output} (${(statSync(output).size / 1024 / 1024).toFixed(0)} MB)`)
