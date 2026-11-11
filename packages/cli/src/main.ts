import { connectTo, defaultEndpoint } from '@dck/adapter-node-net'
import { createJsonLogger, silentLogger } from '@dck/core'
import { startDaemon } from '@dck/daemon'
import { runCli } from './cli.ts'

const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()
const args = process.argv.slice(2)

if (args[0] === 'daemon') {
  const logger = createJsonLogger((line) => process.stderr.write(line))
  const started = await startDaemon({ endpoint, logger })
  if (!started.ok) {
    logger.error('daemon did not start', { reason: started.error.message })
    process.exit(1)
  }
  logger.info('daemon started', { endpoint })
  const stop = async () => {
    await started.value.stop()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
} else {
  process.exitCode = await runCli(args, {
    endpoint,
    connect: (target) => connectTo(target, silentLogger),
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  })
}
