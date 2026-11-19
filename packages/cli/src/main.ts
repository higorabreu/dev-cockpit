import { connectTo, defaultConfigDir, defaultEndpoint } from '@dck/adapter-node-net'
import { silentLogger } from '@dck/core'
import { isDaemonCommand, runDaemonCommand } from './daemon-command.ts'

const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()
const configDir = process.env.DCK_CONFIG_DIR ?? defaultConfigDir()
const args = process.argv.slice(2)
const [command] = args
const io = {
  endpoint,
  connect: (target: string) => connectTo(target, silentLogger),
  out: (text: string) => process.stdout.write(text),
  err: (text: string) => process.stderr.write(text),
}

// The window's global key runs `dck toggle` on every press (D30), so only the socket and the protocol load
// up front: the settings, the catalogs, the daemon and the extensions come in by import() when needed
if (isDaemonCommand(command)) {
  process.exitCode = await runDaemonCommand(command, {
    ...io,
    translate: async () => (await import('./full-cli.ts')).translatorForUser(configDir),
  })
} else if (command === 'daemon') {
  await (await import('./daemon-process.ts')).runDaemonProcess(endpoint)
} else {
  process.exitCode = await (await import('./full-cli.ts')).runFullCli(args, { ...io, configDir })
}
