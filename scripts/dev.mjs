// Runs the cockpit from the repository without clashing with the installed one: own profile, socket and key,
// no tray icon. Usage: `pnpm dev` (builds and opens) or `pnpm dev:dck toggle` (the dev CLI).
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultConfigDir } from '../packages/adapters/node-net/src/endpoint.ts'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
const shell = join(repository, 'packages', 'shell')
const windows = process.platform === 'win32'
const runtime = process.env.XDG_RUNTIME_DIR ?? '/tmp'
const configDir = process.env.DCK_CONFIG_DIR ?? `${defaultConfigDir()}-dev`
// Windows uses a named pipe, which has no folder for the log to sit beside
const endpoint =
  process.env.DCK_ENDPOINT ??
  (windows ? '\\\\.\\pipe\\dck-dev' : join(runtime, 'dck-dev', 'daemon.sock'))
const environment = {
  ...process.env,
  // The dev window and the dev CLI share this folder, apart from the installed app's
  DCK_CONFIG_DIR: configDir,
  DCK_ENDPOINT: endpoint,
  // Beside the dev socket, so the installed daemon's log stays apart
  DCK_LOG_DIR: process.env.DCK_LOG_DIR ?? (windows ? join(tmpdir(), 'dck-dev') : dirname(endpoint)),
  DCK_KEY: process.env.DCK_KEY ?? 'F9',
  DCK_NO_TRAY: '1',
  // The system keyring is shared: dev uses its own keys and never touches the installed app's token
  DCK_PROFILE: process.env.DCK_PROFILE ?? 'dev',
}

const mode = process.argv[2]
const [command, args] =
  mode === 'cli'
    ? ['node', [join(repository, 'packages', 'cli', 'src', 'main.ts'), ...process.argv.slice(3)]]
    : [
        // The electron package exports its binary's path; node_modules/.bin holds a .cmd on Windows that
        // spawn cannot run
        createRequire(join(shell, 'package.json'))('electron'),
        [
          shell,
          // A Linux workaround for Chromium's sandbox helper; the Mac and Windows run with the sandbox
          ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        ],
      ]

const child = spawn(command, args, { env: environment, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
