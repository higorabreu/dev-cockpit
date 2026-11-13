// Builds Dev Cockpit.app and its .dmg from the already built `dist` (`pnpm --filter @dck/shell build`):
// copies the Electron the project already uses, renames it, puts the app in Resources/app, packs the `dck` CLI
// and signs ad hoc. Only macOS's own tools (ditto, plutil, sips, iconutil, lipo, codesign, hdiutil).
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { dckWrapper } from './mac-bundle.mjs'
import {
  buildCli,
  electronDist,
  NAME,
  PRODUCT,
  release,
  shell,
  stageApp,
  version,
} from './package-common.mjs'

if (process.platform !== 'darwin') throw new Error('the .app can only be built on macOS')
const lipoArchitecture = { x64: 'x86_64', arm64: 'arm64' }[process.arch]
if (!lipoArchitecture) throw new Error(`unsupported architecture: ${process.arch}`)

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
run('ditto', [join(electronDist(), 'Electron.app'), bundle])
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
const scale = (pixels, name) =>
  run('sips', ['-z', String(pixels), String(pixels), iconSource, '--out', join(iconset, name)])
for (const size of [16, 32, 128, 256, 512]) {
  scale(size, `icon_${size}x${size}.png`)
  // The source is 512 px, so there is no 512@2x
  if (size < 512) scale(size * 2, `icon_${size}x${size}@2x.png`)
}
run('iconutil', ['-c', 'icns', iconset, '-o', join(resources, `${NAME}.icns`)])
rmSync(iconset, { recursive: true })

// 5. The app
const app = join(resources, 'app')
stageApp(app)

// 6. node-pty: both binaries built for this machine's architecture
const nodePty = join(app, 'node_modules', 'node-pty')
for (const binary of ['pty.node', 'spawn-helper']) {
  const file = join(nodePty, 'build', 'Release', binary)
  const architectures = run('lipo', ['-archs', file]).trim().split(' ')
  if (!architectures.includes(lipoArchitecture)) {
    throw new Error(`${binary} is built for ${architectures.join(', ')}, not ${lipoArchitecture}`)
  }
}

// 7. The packaged `dck` CLI
await buildCli(join(resources, 'dck.mjs'))
mkdirSync(join(resources, 'bin'))
writeFileSync(join(resources, 'bin', 'dck'), dckWrapper(PRODUCT), { mode: 0o755 })

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
