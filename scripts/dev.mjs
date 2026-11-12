// Runs the cockpit from the repository without clashing with the installed one: own profile, socket and key,
// no tray icon. Usage: `pnpm dev` (builds and opens) or `pnpm dev:dck toggle` (the dev CLI).
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
const runtime = process.env.XDG_RUNTIME_DIR ?? '/tmp'
const environment = {
  ...process.env,
  DCK_ENDPOINT: process.env.DCK_ENDPOINT ?? join(runtime, 'dck-dev', 'daemon.sock'),
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
        join(repository, 'packages', 'shell', 'node_modules', '.bin', 'electron'),
        [
          join(repository, 'packages', 'shell'),
          '--no-sandbox',
          `--user-data-dir=${join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'dev-cockpit-dev')}`,
        ],
      ]

const child = spawn(command, args, { env: environment, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
