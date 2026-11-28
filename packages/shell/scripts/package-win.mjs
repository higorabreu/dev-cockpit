// Builds the Windows zip from the already built `dist` (`pnpm --filter @dck/shell build`): copies the Electron the
// project already uses, renames electron.exe, sets its icon and version (rcedit), puts the app in
// resources\app with the `dck` CLI and zips the folder with Windows' own tar. `--smoke` then unpacks the zip
// and runs the app's smoke check and the CLI on it.
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rcedit } from 'rcedit'
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
import { dckCommand, fileVersion, icoFromPngs } from './win-bundle.mjs'

if (process.platform !== 'win32')
  throw new Error('the Windows package can only be built on Windows')
if (process.arch !== 'x64') throw new Error(`unsupported architecture: ${process.arch}`)

const stage = join(release, 'win32')
const folder = join(stage, PRODUCT)
const resources = join(folder, 'resources')
const output = join(release, `${NAME}_${version}_win32-x64.zip`)
// System32's bsdtar writes zips; Git's GNU tar, often first on the PATH, does not
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

// 1. The Electron already installed in the project, without its default app
cpSync(electronDist(), folder, { recursive: true })
rmSync(join(resources, 'default_app.asar'))
const executable = join(folder, `${PRODUCT}.exe`)
renameSync(join(folder, 'electron.exe'), executable)

// 2. Icon and version resource, which Explorer, the taskbar and Task Manager show
const icon = join(stage, `${NAME}.ico`)
const png = (size, file) => ({ size, png: readFileSync(join(shell, 'assets', file)) })
writeFileSync(
  icon,
  icoFromPngs([
    png(24, 'icon.png'),
    png(48, 'app-48.png'),
    png(128, 'app-128.png'),
    png(256, 'app-256.png'),
  ]),
)
await rcedit(executable, {
  icon,
  'file-version': fileVersion(version),
  'product-version': fileVersion(version),
  'version-string': {
    FileDescription: PRODUCT,
    ProductName: PRODUCT,
    OriginalFilename: `${PRODUCT}.exe`,
    InternalName: NAME,
  },
})
rmSync(icon)

// 3. The app, and the CLI beside it so it finds the native bindings in app\node_modules
const app = join(resources, 'app')
stageApp(app)
await buildCli(join(app, 'dck.mjs'))
mkdirSync(join(resources, 'bin'))
writeFileSync(join(resources, 'bin', 'dck.cmd'), dckCommand(PRODUCT))

// 4. The zip, with the folder at its root
rmSync(output, { force: true })
execFileSync(tar, ['-a', '-c', '-f', output, '-C', stage, PRODUCT])
console.log(`app: ${folder}`)
console.log(`package: ${output} (${(statSync(output).size / 1024 / 1024).toFixed(0)} MB)`)

// 5. The smoke check on the zip as a user gets it, with its own profile and pipe so a running cockpit is left
// alone
function smoke() {
  const unpacked = mkdtempSync(join(tmpdir(), 'dck-smoke-'))
  const env = {
    ...process.env,
    DCK_CONFIG_DIR: join(unpacked, 'config'),
    DCK_ENDPOINT: '\\\\.\\pipe\\dck-smoke',
    DCK_LOG_DIR: join(unpacked, 'logs'),
    DCK_PROFILE: 'smoke',
    DCK_NO_TRAY: '1',
  }
  try {
    execFileSync(tar, ['-x', '-f', output, '-C', unpacked])
    const run = spawnSync(join(unpacked, PRODUCT, `${PRODUCT}.exe`), ['--smoke'], {
      encoding: 'utf8',
      timeout: 90_000,
      env,
    })
    const report = run.stderr.split('\n').filter((line) => line.includes('smoke check'))
    console.log(report.join('\n') || run.stderr)
    // The packaged CLI asks the daemon the app started, through the same pipe
    const dck = join(unpacked, PRODUCT, 'resources', 'bin', 'dck.cmd')
    const ping = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${dck}" ping"`], {
      encoding: 'utf8',
      windowsVerbatimArguments: true,
      env,
    })
    console.log(`dck ping: ${ping.stdout.trim() || ping.stderr.trim()}`)
    return run.status === 0 && ping.stdout.trim() === 'pong'
  } finally {
    // The daemon outlives the app, as it does for a user; only the processes run from this folder stop
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Get-Process | Where-Object { $_.Path -like '${unpacked}*' } | Stop-Process -Force`,
    ])
    rmSync(unpacked, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
}

if (process.argv.includes('--smoke') && !smoke()) {
  console.error('smoke check failed')
  process.exitCode = 1
}
