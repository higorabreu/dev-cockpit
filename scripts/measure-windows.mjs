// Measures the packaged Windows app against the AGENTS.md budgets that a script can see: cold start (to the
// window's `window ready`) and idle memory of the window and the daemon. Usage, after `pnpm package:win`:
// `node scripts/measure-windows.mjs [folder]` (default release\win32\Dev Cockpit). It runs with its own profile
// and pipe, so an installed cockpit is left alone; the key and the echo need a person (docs/windows-testing.md).
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') throw new Error('this measures the Windows package')
const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
const folder = resolve(process.argv[2] ?? join(repository, 'release', 'win32', 'Dev Cockpit'))
const IDLE_MS = 20_000
const profile = mkdtempSync(join(tmpdir(), 'dck-measure-'))
const env = {
  ...process.env,
  DCK_CONFIG_DIR: profile,
  DCK_ENDPOINT: '\\\\.\\pipe\\dck-measure',
  DCK_LOG_DIR: profile,
  DCK_PROFILE: 'measure',
  DCK_NO_TRAY: '1',
}
const powershell = (script) =>
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim()
const fromFolder = `Get-Process | Where-Object { $_.Path -like '${folder}\\*' }`

const started = Date.now()
const app = spawn(join(folder, 'Dev Cockpit.exe'), [], { env })
let ready
app.stderr.on('data', (data) => {
  if (ready === undefined && String(data).includes('window ready')) ready = Date.now() - started
})
await new Promise((done) => setTimeout(done, IDLE_MS))
try {
  // Private bytes: the working set counts the DLLs every Electron process shares once per process
  const privateMb = Number(
    powershell(`[int]((${fromFolder} | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB)`),
  )
  console.log(`cold start to window ready: ${ready ?? 'not seen'} ms (budget 2000)`)
  console.log(`idle private memory after ${IDLE_MS / 1000} s: ${privateMb} MB (budget 350)`)
  console.log(`processes: ${powershell(`@(${fromFolder}).Count`)}`)
  if (ready === undefined || ready > 2000 || privateMb > 350) process.exitCode = 1
} finally {
  powershell(`${fromFolder} | Stop-Process -Force`)
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
